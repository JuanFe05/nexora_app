"""Reglas puras y ETL en streaming de Facturación General, solo con facturas sintéticas."""

from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from nexora.statistics.application.general_billing import COLUMNS, process_chunks
from nexora.statistics.domain.general_billing import (
    age_from_dates,
    course_of_life,
    invoice_key,
    money,
    month_name,
    normalize_text,
    payments,
    row_matches,
)


def record(**overrides: Any) -> dict[str, Any]:
    return {
        "estado": " cerrado ",
        "emprs": " EPS X ",
        "prfjo_dcto": " fe ",
        "cnsctvo_dcto": "0001",
        "dscrp_transcn": " factura  electronica de venta ",
        "fcha_dcto": datetime(2026, 1, 31, 12, 30),
        "fcha_ncmnto": "2000-02-29",
        "prmr_nmbre": " Ana ",
        "sgndo_nmbre": None,
        "prmr_aplldo": "  Pérez ",
        "sgndo_aplldo": "",
        "cntdd1": Decimal("0.10"),
        "tpo_lqdcn_pcnte": " copago ",
        "vlr_lqdd_pcnte": "15.25",
        "vlr_frmas_pgo_tpo1": "20.50",
        "vlr_frmas_pgo_tpo2": None,
        "cc_afldo": "00123",
        "fcha_rmsn": "2026-02-01 15:30:00",
    } | overrides


async def chunks(rows: list[Any]) -> AsyncIterator[list[dict[str, Any]]]:
    for row in rows:
        yield [row]


async def processed(rows: list[Any]) -> list[dict[str, Any]]:
    return [row async for row in process_chunks(chunks(rows))]


@pytest.mark.parametrize(
    ("birth", "reference", "expected"),
    [
        ("2026-01-01", "2026-01-30", (29, "DÍAS")),
        ("2026-01-01", "2026-01-31", (1, "MESES")),
        ("2025-01-31", "2025-02-28", (28, "DÍAS")),
        ("2025-01-31", "2025-03-01", (29, "DÍAS")),
        ("2025-01-31", "2025-03-02", (1, "MESES")),
        ("2025-01-31", "2025-03-30", (1, "MESES")),
        ("2025-01-31", "2025-03-31", (2, "MESES")),
        ("2025-12-31", "2026-02-28", (2, "MESES")),
        ("2024-02-29", "2025-02-27", (11, "MESES")),
        ("2024-02-29", "2025-02-28", (1, "AÑOS")),
        ("2000-06-30", "2026-06-29", (25, "AÑOS")),
        ("2000-06-30", "2026-06-30", (26, "AÑOS")),
        ("2026-02-01", "2026-01-31", (None, "")),
        ("invalid", "2026-01-31", (None, "")),
        ("2000-01-01garbage", "2026-01-31", (None, "")),
        ("2000-01-01", "2026-01-31garbage", (None, "")),
        ("2025-01-31 08:30:00", "2025-03-02T12:30:00", (1, "MESES")),
        (None, None, (None, "")),
    ],
)
def test_age_boundaries(birth: Any, reference: Any, expected: tuple[Any, str]) -> None:
    assert age_from_dates(birth, reference) == expected


@pytest.mark.parametrize(
    ("years", "label"),
    [
        (0, "PRIMERA INFANCIA"),
        (5, "PRIMERA INFANCIA"),
        (6, "INFANCIA"),
        (11, "INFANCIA"),
        (12, "ADOLESCENCIA"),
        (17, "ADOLESCENCIA"),
        (18, "JUVENTUD"),
        (28, "JUVENTUD"),
        (29, "ADULTEZ"),
        (59, "ADULTEZ"),
        (60, "VEJEZ"),
        (100, "VEJEZ"),
    ],
)
def test_each_course_of_life_boundary(years: int, label: str) -> None:
    assert course_of_life(date(2026 - years, 1, 1), date(2026, 1, 31)) == label


def test_newborn_and_invalid_course_of_life() -> None:
    birth = date(2026, 1, 1)
    for days in range(7):
        assert course_of_life(birth, birth + timedelta(days=days)) == "RECIEN NACIDO"
    assert course_of_life(birth, birth + timedelta(days=7)) == "PRIMERA INFANCIA"
    assert course_of_life("2024-02-29", "2025-02-28") == "PRIMERA INFANCIA"
    assert course_of_life(birth, date(2025, 12, 31)) == ""
    assert course_of_life("bad", birth) == ""


@pytest.mark.parametrize(
    ("transaction", "company", "state", "expected"),
    [
        ("FACTURA ELECTRONICA DE VENTA", "X", "CERRADO", True),
        ("FACTURA AGRUPADA", "X", "CERRADO", True),
        ("TRANSACCION", "SOS PGP MIR Y COR CONTRIBUTIVO", "CERRADO", True),
        ("TRANSACCION", "SOS PGP MIR Y COR SUBSIDIADO", "CERRADO", True),
        ("TRANSACCION", "PARTICULAR", "CERRADO", False),
        ("FACTURA AGRUPADA", "X", "ABIERTO", False),
        (None, None, None, False),
        ("OTRO", "X", "CERRADO", False),
    ],
)
def test_filter(transaction: Any, company: Any, state: Any, expected: bool) -> None:
    assert row_matches(record(dscrp_transcn=transaction, emprs=company, estado=state)) is expected
    assert row_matches(record())


@pytest.mark.parametrize(
    "kind", ["COPAGO", "COPAGO Y CUOTA MODERADORA", "CUOTA MODERADORA", "SIN CLASIFICAR"]
)
@pytest.mark.parametrize("payment2", [None, "", "  ", 0, "0.00", Decimal("0")])
def test_non_particular_copago(kind: str, payment2: Any) -> None:
    assert payments(record(tpo_lqdcn_pcnte=f" {kind.lower()} ", vlr_frmas_pgo_tpo2=payment2)) == (
        Decimal("15.25"),
        0,
        0,
    )


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        ({"vlr_frmas_pgo_tpo2": "2"}, (0, 0, 0)),
        ({"vlr_frmas_pgo_tpo2": "bad"}, (0, 0, 0)),
        ({"tpo_lqdcn_pcnte": "OTRO"}, (0, 0, 0)),
        ({"vlr_lqdd_pcnte": None}, (0, 0, 0)),
        (
            {"emprs": " particular ", "vlr_frmas_pgo_tpo2": "2.25"},
            (0, Decimal("20.50"), Decimal("2.25")),
        ),
        ({"emprs": "PARTICULAR", "vlr_frmas_pgo_tpo1": None}, (0, 0, 0)),
        ({"emprs": "PARTICULAR", "dscrp_transcn": "FACTURA AGRUPADA"}, (0, 0, 0)),
    ],
)
def test_payment_exclusions_and_particular(
    changes: dict[str, Any], expected: tuple[Any, ...]
) -> None:
    assert payments(record(**changes)) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0),
        (" ", 0),
        ("bad", 0),
        ("NaN", 0),
        ("Infinity", 0),
        ("0.10", Decimal("0.10")),
        (Decimal("12.30"), Decimal("12.30")),
        ("-2.25", Decimal("-2.25")),
        ("1000", 1000),
    ],
)
def test_money_is_exact(value: Any, expected: Any) -> None:
    assert money(value) == expected
    assert not isinstance(money(value), float)


def test_normalization_and_month_names() -> None:
    assert normalize_text("  Ána \t pérez  ") == "ÁNA PÉREZ"
    assert normalize_text(None) == ""
    assert [month_name(date(2026, m, 1)) for m in range(1, 13)] == [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
    ]
    assert month_name("bad") == ""
    assert invoice_key(record()) == ("FE", "FACTURA ELECTRONICA DE VENTA", "0001")


async def test_filtered_first_row_totals_across_chunks_and_invoice_keys() -> None:
    rows = await processed(
        [
            record(estado="ABIERTO", cntdd1=999),
            record(),
            None,
            record(cntdd1="0.20"),
            record(prfjo_dcto="OTRO", cntdd1="3"),
            record(prfjo_dcto="OTRO", dscrp_transcn="FACTURA AGRUPADA", cntdd1="4"),
            record(cnsctvo_dcto="0002", emprs="PARTICULAR", cntdd1="5", vlr_frmas_pgo_tpo2="2"),
            record(cnsctvo_dcto="0002", emprs="PARTICULAR", cntdd1="6", vlr_frmas_pgo_tpo2="2"),
        ]
    )
    assert len(rows) == 6
    assert [r["total_cntdd1"] for r in rows] == [Decimal("0.30"), 0, 3, 4, 11, 0]
    assert [r["vlr_copago"] for r in rows] == [
        Decimal("15.25"),
        0,
        Decimal("15.25"),
        Decimal("15.25"),
        0,
        0,
    ]
    assert [r["pago_tpo1"] for r in rows] == [0, 0, 0, 0, Decimal("20.50"), 0]
    assert [r["pago_tpo2"] for r in rows] == [0, 0, 0, 0, 2, 0]
    assert all(list(r) == [c[0] for c in COLUMNS] for r in rows)
    first = rows[0]
    assert first["nombre_completo"] == "ANA PÉREZ"
    assert first["cc_afldo"] == "00123" and first["cnsctvo_dcto"] == "0001"
    assert first["fcha_dcto"] == "2026-01-31" and first["fcha_rmsn"] == "2026-02-01"
    assert (first["edad"], first["tipo_edad"], first["grupo_etario"]) == (25, "AÑOS", "JUVENTUD")
    assert first["mes_dcto"] == "ENERO"
    assert first["vlr_srvcs"] == 0 and first["procedimiento"] == ""


async def test_inconsistent_and_null_values_do_not_break_etl() -> None:
    rows = await processed([record(fcha_ncmnto="bad", cntdd1="NaN"), record(fcha_dcto=None)])
    assert len(rows) == 2
    assert rows[0]["edad"] is None and rows[0]["tipo_edad"] == "" and rows[0]["grupo_etario"] == ""
    assert rows[0]["total_cntdd1"] == Decimal("0.10")
    assert rows[1]["fcha_dcto"] == "" and rows[1]["mes_dcto"] == ""


async def test_generator_yields_at_invoice_boundary_not_end_of_stream() -> None:
    reached_end = False

    async def source() -> AsyncIterator[list[dict[str, Any]]]:
        nonlocal reached_end
        yield [record(), record(cnsctvo_dcto="2")]
        reached_end = True
        yield [record(cnsctvo_dcto="3")]

    stream = process_chunks(source())
    assert (await anext(stream))["total_cntdd1"] == Decimal("0.10")
    assert not reached_end
    await stream.aclose()


async def test_large_decimal_totals_do_not_round_at_default_context_precision() -> None:
    rows = await processed(
        [
            record(cntdd1=Decimal("123456789012345678901234567890.12")),
            record(cntdd1=Decimal("0.03")),
        ]
    )
    assert rows[0]["total_cntdd1"] == Decimal("123456789012345678901234567890.15")
    assert rows[1]["total_cntdd1"] == 0


async def test_plain_async_iterator_is_supported_without_aclose() -> None:
    class Iterator:
        sent = False

        def __aiter__(self) -> Any:
            return self

        async def __anext__(self) -> list[dict[str, Any]]:
            if self.sent:
                raise StopAsyncIteration
            self.sent = True
            return [record()]

    assert len([row async for row in process_chunks(Iterator())]) == 1
