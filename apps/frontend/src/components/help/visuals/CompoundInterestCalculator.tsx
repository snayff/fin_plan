import { useState } from "react";
import { futureValueMonthly } from "@finplan/shared";

function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CompoundInterestCalculator() {
  const [balance, setBalance] = useState(10000);
  const [monthly, setMonthly] = useState(200);
  const [rate, setRate] = useState(5);

  const horizons = [1, 5, 10] as const;

  const inputClass =
    "w-full rounded-md border bg-card py-1.5 px-3 text-sm font-mono outline-none focus:border-page-accent/60";
  const labelClass = "block text-xs text-muted-foreground mb-1";

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label htmlFor="calc-balance" className={labelClass}>
            Starting balance
          </label>
          <input
            id="calc-balance"
            aria-label="Starting balance"
            type="number"
            min={0}
            value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="calc-monthly" className={labelClass}>
            Monthly contribution
          </label>
          <input
            id="calc-monthly"
            aria-label="Monthly contribution"
            type="number"
            min={0}
            value={monthly}
            onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="calc-rate" className={labelClass}>
            Annual interest rate (%)
          </label>
          <input
            id="calc-rate"
            aria-label="Annual interest rate (%)"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {horizons.map((years) => {
          const fv = futureValueMonthly(balance, monthly, rate, years);
          const label = years === 1 ? "1 year" : `${years} years`;
          return (
            <div key={years} className="rounded-md border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="font-mono text-lg font-semibold text-foreground">{formatGBP(fv)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
