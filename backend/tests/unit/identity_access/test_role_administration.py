"""Role read DTO counts pass through the application without changing the aggregate."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from nexora.identity_access.application.dto.role import RoleRead
from nexora.identity_access.application.ports.administration import AdministrationRepository
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.application.use_cases.administration import RoleAdministration
from nexora.identity_access.domain.entities.role import Role
from nexora.identity_access.domain.value_objects.enums import RoleStatus


async def test_role_list_propagates_read_counts_and_preserves_page_contract() -> None:
    repository = AsyncMock(spec=AdministrationRepository)
    role = Role(id=uuid4(), code="CUSTOM", name="Custom", status=RoleStatus.ACTIVE)
    repository.list_roles.return_value = [RoleRead(role, 3)]
    repository.permission_codes_by_role.return_value = {role.id: ("custom.view",)}
    repository.count_roles.return_value = 12
    use_case = RoleAdministration(repository=repository, transaction=AsyncMock(spec=Transaction))
    page = await use_case.list(limit=2, offset=4, query="  CUSTOM  ")
    assert page.total == 12
    assert len(page.items) == 1
    assert page.items[0].role == role
    assert page.items[0].permissions == ("custom.view",)
    assert page.items[0].assigned_users == 3
    repository.list_roles.assert_awaited_once_with(limit=2, offset=4, query="CUSTOM")
    repository.count_roles.assert_awaited_once_with(query="CUSTOM")
    repository.permission_codes_by_role.assert_awaited_once_with([role.id])
    repository.count_role_assignments.assert_not_awaited()


@pytest.mark.parametrize("count", [0, 1, 8])
async def test_role_detail_propagates_count(count: int) -> None:
    repository = AsyncMock(spec=AdministrationRepository)
    role = Role(id=uuid4(), code="CUSTOM", name="Custom", status=RoleStatus.ACTIVE)
    repository.get_role_read.return_value = RoleRead(role, count)
    repository.permission_codes_by_role.return_value = {}
    use_case = RoleAdministration(repository=repository, transaction=AsyncMock(spec=Transaction))
    detail = await use_case.get(role.id)
    assert detail.role == role
    assert detail.permissions == ()
    assert detail.assigned_users == count
    repository.get_role_read.assert_awaited_once_with(role.id)
    repository.count_role_assignments.assert_not_awaited()
