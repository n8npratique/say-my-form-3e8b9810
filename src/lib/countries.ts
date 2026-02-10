export interface Country {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  dialCode: string;
  flag: string;       // emoji flag
  phoneMask: string;  // # = digit
  minDigits: number;  // min digits after dial code
  maxDigits: number;  // max digits after dial code
}

// Top countries + extras for search
export const COUNTRIES: Country[] = [
  { code: "BR", name: "Brasil", dialCode: "+55", flag: "🇧🇷", phoneMask: "(##) #####-####", minDigits: 10, maxDigits: 11 },
  { code: "US", name: "Estados Unidos", dialCode: "+1", flag: "🇺🇸", phoneMask: "(###) ###-####", minDigits: 10, maxDigits: 10 },
  { code: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷", phoneMask: "(##) ####-####", minDigits: 10, maxDigits: 10 },
  { code: "GB", name: "Reino Unido", dialCode: "+44", flag: "🇬🇧", phoneMask: "#### ######", minDigits: 10, maxDigits: 10 },
  { code: "DE", name: "Alemanha", dialCode: "+49", flag: "🇩🇪", phoneMask: "### ########", minDigits: 10, maxDigits: 11 },
  { code: "FR", name: "França", dialCode: "+33", flag: "🇫🇷", phoneMask: "# ## ## ## ##", minDigits: 9, maxDigits: 9 },
  { code: "IT", name: "Itália", dialCode: "+39", flag: "🇮🇹", phoneMask: "### ### ####", minDigits: 9, maxDigits: 10 },
  { code: "ES", name: "Espanha", dialCode: "+34", flag: "🇪🇸", phoneMask: "### ### ###", minDigits: 9, maxDigits: 9 },
  { code: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹", phoneMask: "### ### ###", minDigits: 9, maxDigits: 9 },
  { code: "MX", name: "México", dialCode: "+52", flag: "🇲🇽", phoneMask: "## #### ####", minDigits: 10, maxDigits: 10 },
  { code: "JP", name: "Japão", dialCode: "+81", flag: "🇯🇵", phoneMask: "##-####-####", minDigits: 10, maxDigits: 10 },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳", phoneMask: "### #### ####", minDigits: 11, maxDigits: 11 },
  { code: "IN", name: "Índia", dialCode: "+91", flag: "🇮🇳", phoneMask: "##### #####", minDigits: 10, maxDigits: 10 },
  { code: "CA", name: "Canadá", dialCode: "+1", flag: "🇨🇦", phoneMask: "(###) ###-####", minDigits: 10, maxDigits: 10 },
  { code: "AU", name: "Austrália", dialCode: "+61", flag: "🇦🇺", phoneMask: "### ### ###", minDigits: 9, maxDigits: 9 },
  { code: "CO", name: "Colômbia", dialCode: "+57", flag: "🇨🇴", phoneMask: "### ### ####", minDigits: 10, maxDigits: 10 },
  { code: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱", phoneMask: "# #### ####", minDigits: 9, maxDigits: 9 },
  { code: "PE", name: "Peru", dialCode: "+51", flag: "🇵🇪", phoneMask: "### ### ###", minDigits: 9, maxDigits: 9 },
  { code: "UY", name: "Uruguai", dialCode: "+598", flag: "🇺🇾", phoneMask: "## ### ###", minDigits: 8, maxDigits: 8 },
  { code: "PY", name: "Paraguai", dialCode: "+595", flag: "🇵🇾", phoneMask: "### ### ###", minDigits: 9, maxDigits: 9 },
  { code: "KR", name: "Coreia do Sul", dialCode: "+82", flag: "🇰🇷", phoneMask: "##-####-####", minDigits: 10, maxDigits: 11 },
  { code: "RU", name: "Rússia", dialCode: "+7", flag: "🇷🇺", phoneMask: "(###) ###-##-##", minDigits: 10, maxDigits: 10 },
  { code: "ZA", name: "África do Sul", dialCode: "+27", flag: "🇿🇦", phoneMask: "## ### ####", minDigits: 9, maxDigits: 9 },
  { code: "AE", name: "Emirados Árabes", dialCode: "+971", flag: "🇦🇪", phoneMask: "## ### ####", minDigits: 9, maxDigits: 9 },
  { code: "IL", name: "Israel", dialCode: "+972", flag: "🇮🇱", phoneMask: "##-###-####", minDigits: 9, maxDigits: 9 },
];

// Top 10 always shown first
export const TOP_COUNTRY_CODES = ["BR", "US", "AR", "PT", "MX", "GB", "DE", "FR", "ES", "IT"];

export function getDefaultCountry(): Country {
  return COUNTRIES.find(c => c.code === "BR")!;
}

export function applyPhoneMask(raw: string, mask: string): string {
  const digits = raw.replace(/\D/g, "");
  let result = "";
  let dIdx = 0;
  for (let i = 0; i < mask.length && dIdx < digits.length; i++) {
    if (mask[i] === "#") {
      result += digits[dIdx++];
    } else {
      result += mask[i];
    }
  }
  return result;
}

export function extractDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isPhoneValid(digits: string, country: Country): boolean {
  return digits.length >= country.minDigits && digits.length <= country.maxDigits;
}

// Blocked email providers
const BLOCKED_EMAIL_DOMAINS = [
  "nao.com", "naotenho.com", "ntenhoemail.com", "naoemail.com",
  "semmail.com", "naotem.com", "fake.com", "test.test",
  "exemplo.com", "example.com", "mailinator.com", "guerrillamail.com",
  "tempmail.com", "throwaway.email", "yopmail.com", "sharklasers.com",
];

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: false };
  if (!email.includes("@")) return { valid: false, error: "O e-mail precisa conter @" };
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, error: "Formato inválido" };
  const domain = parts[1].toLowerCase();
  if (!domain.includes(".")) return { valid: false, error: "Domínio inválido" };
  if (domain.split(".").some(p => p.length === 0)) return { valid: false, error: "Domínio inválido" };
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) return { valid: false, error: "Provedor de e-mail não permitido" };
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) return { valid: false, error: "Formato de e-mail inválido" };
  return { valid: true };
}
