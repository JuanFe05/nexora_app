import { useRef, useState } from "react";
import { assignUserRole, createUser, revokeUserRole, updateUser } from "../api/users-api";
import { userError } from "../api/user-error";
import type { RoleOption, User, UserValues } from "../types";
import { changedUserFields, createUserBody } from "./user-validation";
import type { UserPermissions } from "./use-user-permissions";

/** Each confirmed step advances the baseline, so a retry never repeats completed mutations. */
export function useUserSave(original: User | null, permissions: UserPermissions) {
  const baseline = useRef(original ? { ...original, roles: [...original.roles] } : null);
  const applied = useRef<string[]>([]);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [createdUser, setCreatedUser] = useState<User | null>(null);

  async function save(values: UserValues, selected: string[], catalog: RoleOption[]) {
    if (busy.current) return { ok: false as const, message: "Espera a que termine el guardado.", fields: {} };
    busy.current = true;
    setPending(true);
    let step = "crear el usuario";
    try {
      let current = baseline.current;
      if (!current) {
        if (!permissions.create) return { ok: true as const };
        current = await createUser(createUserBody(values));
        baseline.current = { ...current, roles: [...current.roles] };
        current = baseline.current;
        applied.current.push("crear usuario");
        setCreatedUser(current);
      } else if (original) {
        const { estado, ...personal } = changedUserFields(current, values);
        const body = { ...(permissions.update ? personal : {}), ...(permissions.deactivate && estado ? { estado } : {}) };
        if (Object.keys(body).length) {
          step = "guardar los datos personales";
          await updateUser(current.id, body);
          Object.assign(current, body);
          applied.current.push("datos personales");
        }
      }
      if (permissions.editRoles) {
        // Assign before revoking; never temporarily remove existing access unnecessarily.
        for (const role of catalog.filter(role => selected.includes(role.codigo) && !current.roles.includes(role.codigo))) {
          step = `asignar el rol ${role.codigo}`;
          await assignUserRole(current.id, role.id);
          current.roles.push(role.codigo);
          applied.current.push(`asignar ${role.codigo}`);
        }
        // Creation only adds requested roles; preserve any defaults returned by the API.
        for (const role of catalog.filter(role => original && !selected.includes(role.codigo) && current.roles.includes(role.codigo))) {
          step = `revocar el rol ${role.codigo}`;
          await revokeUserRole(current.id, role.id);
          current.roles = current.roles.filter(code => code !== role.codigo);
          applied.current.push(`revocar ${role.codigo}`);
        }
      }
      return { ok: true as const };
    } catch (error: unknown) {
      const mapped = userError(error);
      const progress = applied.current.length ? ` Cambios ya aplicados: ${applied.current.join(", ")}.` : "";
      return { ok: false as const, fields: mapped.fields, message: `No se pudo ${step}. ${mapped.message}${progress} La operación no es atómica; la tabla se recargará para comprobar el estado actual.` };
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { save, pending, createdUser };
}
