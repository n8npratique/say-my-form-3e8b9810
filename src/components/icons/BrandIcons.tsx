/** Branded SVG icons for Google services */

interface IconProps {
  className?: string;
  size?: number;
}

export const GoogleSheetsIcon = ({ className = "", size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#0F9D58" />
    <path d="M14 2v6h6" fill="#87CEAB" />
    <rect x="8" y="12" width="8" height="1.5" rx=".5" fill="#fff" />
    <rect x="8" y="15" width="8" height="1.5" rx=".5" fill="#fff" />
    <rect x="8" y="12" width="1.5" height="4.5" rx=".5" fill="#fff" />
    <rect x="11.25" y="12" width="1.5" height="4.5" rx=".5" fill="#fff" />
    <rect x="14.5" y="12" width="1.5" height="4.5" rx=".5" fill="#fff" />
  </svg>
);

export const GoogleCalendarIcon = ({ className = "", size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
    <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4" />
    <rect x="3" y="4" width="18" height="5" rx="2" fill="#1A73E8" />
    <rect x="7" y="2" width="2" height="4" rx="1" fill="#1A73E8" />
    <rect x="15" y="2" width="2" height="4" rx="1" fill="#1A73E8" />
    <rect x="7" y="12" width="2" height="2" rx=".4" fill="#fff" />
    <rect x="11" y="12" width="2" height="2" rx=".4" fill="#fff" />
    <rect x="15" y="12" width="2" height="2" rx=".4" fill="#fff" />
    <rect x="7" y="16" width="2" height="2" rx=".4" fill="#fff" />
    <rect x="11" y="16" width="2" height="2" rx=".4" fill="#fff" />
  </svg>
);

export const GmailIcon = ({ className = "", size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" fill="#EA4335" />
    <path d="M2 6l10 7 10-7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="4" width="3" height="16" fill="#C5221F" />
    <rect x="19" y="4" width="3" height="16" fill="#C5221F" />
  </svg>
);

export const WhatsAppIcon = ({ className = "", size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
    <rect width="24" height="24" rx="12" fill="#25D366" />
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
      fill="#fff"
    />
  </svg>
);
