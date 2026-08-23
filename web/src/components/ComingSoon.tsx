export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="text-center py-24 text-foreground/50">
      <h2 className="font-display text-lg font-semibold text-foreground mb-1">{title}</h2>
      <p className="text-sm">Coming soon.</p>
    </div>
  );
}
