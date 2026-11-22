import {
  ArrowLeftRight, BarChart3, Building2, CreditCard, Inbox, Landmark, LayoutDashboard, MessageCircle, Receipt, Search, Settings, Target, TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  main?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard, main: true },
  { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight, main: true },
  { href: "/cartoes", label: "Cartões", icon: CreditCard, main: true },
  { href: "/contas", label: "Contas a pagar", icon: Receipt, main: true },
  { href: "/revisao", label: "Revisão", icon: Inbox },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
  { href: "/open-finance", label: "Open Finance", icon: Building2 },
  { href: "/busca", label: "Busca", icon: Search },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export const SIMULATOR_ITEM: NavItem = { href: "/simulador", label: "Simulador WhatsApp", icon: MessageCircle };
