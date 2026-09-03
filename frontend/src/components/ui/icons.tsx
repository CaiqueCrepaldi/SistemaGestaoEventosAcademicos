import type { SVGProps } from "react";

// Ícones do menu principal, desenhados à mão em SVG (sem depender de
// nenhuma biblioteca de ícones externa). `Icon` é a base compartilhada —
// define tamanho/traço padrão — e cada função abaixo só desenha as formas
// (retângulos, linhas, círculos) específicas daquele ícone.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

export function EventoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </Icon>
  );
}

export function SessaoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M8 9l3 2-3 2z" />
    </Icon>
  );
}

export function SalaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 21V4.5a1 1 0 0 1 1.2-1L16 5v16" />
      <path d="M16 5l3 .7V21" />
      <path d="M5 21h14" />
      <circle cx="12.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PalestranteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="9" y="2.5" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </Icon>
  );
}

export function ParticipanteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16 4.3a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17.5 13.3a6.2 6.2 0 0 1 3.7 5.6" />
    </Icon>
  );
}

export function InscricaoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2.5h6a1 1 0 0 1 1 1V5H8V3.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 12l2 2 4-4.5" />
      <path d="M8.5 17h7" />
    </Icon>
  );
}

export function CheckinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.6 2.6L16 9.5" />
    </Icon>
  );
}

export function AgendaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.6 1.6" />
      <path d="M9 2.5h6" />
    </Icon>
  );
}

export function CertificadoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="5.5" />
      <path d="M12 6.3l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
      <path d="M9 13.5L7.5 21l4.5-2.2 4.5 2.2-1.5-7.5" />
    </Icon>
  );
}

export function FeedbackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v10.5a1.5 1.5 0 0 1-1.5 1.5H9l-4 4V6.5A1.5 1.5 0 0 1 4 5Z" />
      <path d="M8 9.5h8" />
      <path d="M8 12.5h5" />
    </Icon>
  );
}
