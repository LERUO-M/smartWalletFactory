import { Outlet } from 'react-router-dom';

export default function PhoneShell() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zaka-ink font-body text-zaka-cream antialiased">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-zaka-teal/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full flex-col px-6 pb-8 pt-6 max-w-[440px] lg:max-w-3xl lg:px-10 lg:pt-10">
        <Outlet />
      </div>
    </div>
  );
}
