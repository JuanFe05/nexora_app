// Outside React render: usable as a lazy state initializer and with a fake clock in tests.
export function getCurrentYear() {
  return new Date().getFullYear();
}
