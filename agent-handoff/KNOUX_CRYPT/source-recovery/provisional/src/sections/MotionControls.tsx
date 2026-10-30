export default function MotionControls() {
  return (
    <section
      aria-label="Splash atmosphere"
      className="relative h-full max-w-md mx-auto overflow-hidden py-16"
    >
      <div className="pointer-events-none absolute -right-48 -top-20 h-64 w-80 rounded-full border border-primary/20 rotate-[-26deg]" />
      <div className="pointer-events-none absolute -right-40 -top-24 h-48 w-72 rounded-full border border-primary/40 rotate-[-26deg]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-[13rem] rounded-full border border-primary/30 rotate-[-27deg]" />
      <div className="pointer-events-none absolute -bottom-48 -right-36 h-96 w-[14%] rounded-full border border-primary/20 rotate-[-27deg]" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-28 w-48 rounded-full bg-primary/20 blur-3xl" />
    </section>
  );
}
