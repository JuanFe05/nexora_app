import { useRef, useState } from "react";
import { assignPermission, changedRoleFields, createRole, revokePermission, roleErrorMessage, updateRole } from "../api/roles-api";
import { ADMINISTRATOR_CODE } from "../constants";
import type { PermissionOption, Role, RoleValues } from "../types";

/** Keeps a checkpoint after each successful step so partial saves can be retried safely. */
export function useRoleSave(initialRole: Role | null, onReload: () => void, onSuccess: (created: boolean) => void) {
  const checkpoint = useRef<Role | null>(initialRole);
  const saving = useRef(false);
  const created = useRef(false);
  const [savedRole, setSavedRole] = useState(initialRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remember(role: Role) {
    checkpoint.current = role;
    setSavedRole(role);
  }
  async function save(values: RoleValues, selected: ReadonlySet<string>, catalog: PermissionOption[]) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    let step = checkpoint.current ? "No se pudo actualizar el rol." : "No se pudo crear el rol.";
    try {
      let current = checkpoint.current;
      if (!current) {
        current = await createRole({ codigo: values.codigo, nombre: values.nombre, descripcion: values.descripcion });
        created.current = true;
        remember(current);
      } else {
        const mutable = { nombre: values.nombre, descripcion: values.descripcion, estado: current.codigo === ADMINISTRATOR_CODE ? current.estado : values.estado };
        if (Object.keys(changedRoleFields(current, mutable)).length) {
          current = await updateRole(current, mutable);
          remember(current);
        }
      }
      if (current.codigo !== ADMINISTRATOR_CODE) {
        for (const permission of catalog) {
          const has: boolean = current.permisos.includes(permission.codigo);
          const wants = selected.has(permission.codigo);
          if (has === wants) continue;
          step = `No se pudo ${wants ? "asignar" : "revocar"} el permiso ${permission.nombre}.`;
          if (wants) await assignPermission(current.id, permission.id);
          else await revokePermission(current.id, permission.id);
          current = { ...current, permisos: wants ? [...current.permisos, permission.codigo] : current.permisos.filter(code => code !== permission.codigo) };
          remember(current);
        }
      }
      onSuccess(created.current);
    } catch (failure: unknown) {
      setError(`${created.current ? "El rol se creó y se conserva. " : ""}${step} ${roleErrorMessage(failure)}`);
    } finally {
      saving.current = false;
      setPending(false);
      onReload();
    }
  }
  return { savedRole, pending, error, save };
}
