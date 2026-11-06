import { useAuth } from "../use-auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <details className="relative text-sm text-gray-700 dark:text-gray-300">
      <summary className="cursor-pointer rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand-500">
        {user.nombre_completo}
      </summary>
      <div className="absolute end-0 top-full mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
        <p className="break-words font-medium">{user.nombre_completo}</p>
        <p className="mt-1 break-words text-gray-500 dark:text-gray-400">{user.correo}</p>
        <button type="button" onClick={() => { void logout(); }} className="mt-4 w-full rounded-lg px-3 py-2 text-start hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-gray-800">
          Cerrar sesion
        </button>
      </div>
    </details>
  );
}
