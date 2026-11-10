/** Estado de la cuenta como texto normal (sin badge); conserva el valor real del backend. */
export function ProfileStatus({ estado }: { estado: string }) {
  const value = estado.toLowerCase();
  const label = value === "activo" ? "Activo" : value === "inactivo" ? "Inactivo" : estado;
  return <span>{label}</span>;
}
