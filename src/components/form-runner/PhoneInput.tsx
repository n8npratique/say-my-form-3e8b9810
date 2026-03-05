import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";
import {
  COUNTRIES,
  TOP_COUNTRY_CODES,
  getDefaultCountry,
  applyPhoneMask,
  extractDigits,
  isPhoneValid,
  type Country,
} from "@/lib/countries";

interface PhoneInputProps {
  value: string;
  onChange: (fullValue: string, isValid: boolean) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  defaultCountryCode?: string;
}

export const PhoneInput = ({ value, onChange, onKeyDown, autoFocus, defaultCountryCode }: PhoneInputProps) => {
  const [country, setCountry] = useState<Country>(
    (defaultCountryCode && COUNTRIES.find(c => c.code === defaultCountryCode)) || getDefaultCountry()
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rawDigits, setRawDigits] = useState("");
  const [touched, setTouched] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const topCountries = useMemo(() =>
    TOP_COUNTRY_CODES.map(code => COUNTRIES.find(c => c.code === code)!),
    []
  );

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const masked = applyPhoneMask(rawDigits, country.phoneMask);
  const digits = extractDigits(rawDigits);
  const valid = isPhoneValid(digits, country);
  const showError = touched && digits.length > 0 && !valid;

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDigits = extractDigits(e.target.value);
    if (newDigits.length <= country.maxDigits) {
      setRawDigits(newDigits);
      const full = `${country.dialCode} ${applyPhoneMask(newDigits, country.phoneMask)}`;
      onChange(full, isPhoneValid(newDigits, country));
    }
  };

  const selectCountry = (c: Country) => {
    setCountry(c);
    setRawDigits("");
    setOpen(false);
    setSearch("");
    onChange("", false);
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {/* Country selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 h-14 px-3 border-0 border-b-2 bg-transparent hover:border-primary transition-colors min-w-[100px]"
          >
            <span className="text-xl">{country.flag}</span>
            <span className="text-sm font-medium" style={{ color: "var(--runner-text-secondary)" }}>{country.dialCode}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>

          {open && (
            <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-background border rounded-lg shadow-lg max-h-80 overflow-hidden">
              <div className="p-2 border-b">
                <div className="flex items-center gap-2 px-2">
                  <Search className="h-4 w-4 opacity-50" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Buscar país..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm bg-transparent outline-none py-1.5"
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-60">
                {!search.trim() && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Mais usados</div>
                    {topCountries.map(c => (
                      <button
                        key={`top-${c.code}`}
                        type="button"
                        onClick={() => selectCountry(c)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${country.code === c.code ? "bg-accent/30" : ""}`}
                      >
                        <span className="text-lg">{c.flag}</span>
                        <span className="flex-1 text-left">{c.name}</span>
                        <span className="text-muted-foreground">{c.dialCode}</span>
                      </button>
                    ))}
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-2">Todos os países</div>
                  </>
                )}
                {filteredCountries.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => selectCountry(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${country.code === c.code ? "bg-accent/30" : ""}`}
                  >
                    <span className="text-lg">{c.flag}</span>
                    <span className="flex-1 text-left">{c.name}</span>
                    <span className="text-muted-foreground">{c.dialCode}</span>
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhum país encontrado</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone input */}
        <Input
          type="tel"
          placeholder={country.phoneMask.replace(/#/g, "0")}
          value={masked}
          onChange={handleInput}
          onBlur={() => setTouched(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className={`text-lg h-14 border-0 border-b-2 rounded-none bg-transparent focus-visible:ring-0 flex-1 ${showError ? "border-red-500 focus-visible:border-red-500" : "focus-visible:border-primary"}`}
        />
      </div>

      {/* Hint */}
      <p className="text-xs opacity-40" style={{ color: "var(--runner-text-secondary)" }}>
        Ex: {country.dialCode} {country.phoneMask.replace(/#/g, "9")}
      </p>

      {showError && (
        <p className="text-xs text-red-500 font-medium">
          Número incompleto. {country.name} exige {country.minDigits === country.maxDigits ? country.minDigits : `${country.minDigits}-${country.maxDigits}`} dígitos.
        </p>
      )}
    </div>
  );
};
