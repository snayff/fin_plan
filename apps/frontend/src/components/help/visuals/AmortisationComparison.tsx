export function AmortisationComparison() {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <p className="text-xs text-muted-foreground mb-3">£1,200 annual car insurance</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border bg-card p-3">
          <p className="text-[11px] text-muted-foreground/70 mb-1">Without amortisation</p>
          <div className="space-y-1">
            {["Jan", "Feb", "Mar", "Apr (due)", "May", "Jun"].map((month) => (
              <div key={month} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{month}</span>
                <span className="font-mono">
                  {month === "Apr (due)" ? <span className="text-attention">£1,200</span> : "£0"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border bg-card p-3">
          <p className="text-[11px] text-muted-foreground/70 mb-1">With amortisation (÷12)</p>
          <div className="space-y-1">
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => (
              <div key={month} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{month}</span>
                <span className="font-mono text-tier-committed">£100</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
