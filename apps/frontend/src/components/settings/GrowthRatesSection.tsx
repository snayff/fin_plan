import { Input } from "@/components/ui/input";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";

interface RateValues {
  currentRatePct: number;
  savingsRatePct: number;
  investmentRatePct: number;
  pensionRatePct: number;
  inflationRatePct: number;
  propertyRatePct: number;
  vehicleRatePct: number;
  otherAssetRatePct: number;
}

const DEFAULTS: RateValues = {
  currentRatePct: 0,
  savingsRatePct: 4,
  investmentRatePct: 7,
  pensionRatePct: 6,
  inflationRatePct: 2.5,
  propertyRatePct: 3.5,
  vehicleRatePct: -15,
  otherAssetRatePct: 0,
};

const LABELS: Record<keyof RateValues, string> = {
  currentRatePct: "Default current account rate (%)",
  savingsRatePct: "Default savings rate (%)",
  investmentRatePct: "Default investment rate (%)",
  pensionRatePct: "Default pension rate (%)",
  inflationRatePct: "Inflation rate (%)",
  propertyRatePct: "Default property growth rate (%)",
  vehicleRatePct: "Default vehicle depreciation rate (%)",
  otherAssetRatePct: "Default other asset rate (%)",
};

/** Fields that allow negative values (depreciation). */
const ALLOWS_NEGATIVE = new Set<keyof RateValues>(["vehicleRatePct", "otherAssetRatePct"]);

function RateField({
  rateKey,
  current,
  onUpdate,
}: {
  rateKey: keyof RateValues;
  current: RateValues;
  onUpdate: (next: RateValues) => Promise<void>;
}) {
  const { value, setValue, status, errorMessage } = useAutoSave<number>({
    initialValue: current[rateKey],
    onSave: async (next) => onUpdate({ ...current, [rateKey]: next }),
  });

  const min = ALLOWS_NEGATIVE.has(rateKey) ? -100 : 0;

  return (
    <AutoSaveField
      label={LABELS[rateKey]}
      htmlFor={`rate-${rateKey}`}
      status={status}
      errorMessage={errorMessage}
    >
      <Input
        id={`rate-${rateKey}`}
        type="number"
        step={0.1}
        min={min}
        max={100}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
        aria-invalid={status === "error"}
      />
    </AutoSaveField>
  );
}

const ACCOUNT_RATE_KEYS: Array<keyof RateValues> = [
  "currentRatePct",
  "savingsRatePct",
  "investmentRatePct",
  "pensionRatePct",
  "inflationRatePct",
];

const ASSET_RATE_KEYS: Array<keyof RateValues> = [
  "propertyRatePct",
  "vehicleRatePct",
  "otherAssetRatePct",
];

export function GrowthRatesSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const current: RateValues = {
    currentRatePct: settings?.currentRatePct ?? DEFAULTS.currentRatePct,
    savingsRatePct: settings?.savingsRatePct ?? DEFAULTS.savingsRatePct,
    investmentRatePct: settings?.investmentRatePct ?? DEFAULTS.investmentRatePct,
    pensionRatePct: settings?.pensionRatePct ?? DEFAULTS.pensionRatePct,
    inflationRatePct: settings?.inflationRatePct ?? DEFAULTS.inflationRatePct,
    propertyRatePct: settings?.propertyRatePct ?? DEFAULTS.propertyRatePct,
    vehicleRatePct: settings?.vehicleRatePct ?? DEFAULTS.vehicleRatePct,
    otherAssetRatePct: settings?.otherAssetRatePct ?? DEFAULTS.otherAssetRatePct,
  };

  const save = async (next: RateValues) => {
    await updateSettings.mutateAsync(next);
  };

  return (
    <SettingsSection
      id="growth-rates"
      title="Growth rates"
      description={
        <>
          Default annual growth rates used for{" "}
          <GlossaryTermMarker entryId="projection">projections</GlossaryTermMarker>.
        </>
      }
    >
      <div className="flex flex-col gap-5 max-w-lg">
        <div>
          <p className="label-section mb-2">Accounts</p>
          <div className="grid grid-cols-2 gap-3">
            {ACCOUNT_RATE_KEYS.map((k) => (
              <RateField key={k} rateKey={k} current={current} onUpdate={save} />
            ))}
          </div>
        </div>
        <div>
          <p className="label-section mb-2">Assets</p>
          <div className="grid grid-cols-2 gap-3">
            {ASSET_RATE_KEYS.map((k) => (
              <RateField key={k} rateKey={k} current={current} onUpdate={save} />
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
