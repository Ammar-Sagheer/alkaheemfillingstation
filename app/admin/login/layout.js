export const metadata = {
  title: 'Sign in',
};

export default function LoginLayout({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
