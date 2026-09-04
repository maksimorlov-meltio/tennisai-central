// The dashboard used to carry its own EmptyState with a slightly different
// shape (an `action` prop, tighter padding). Nothing imported it, and two
// components with one name is a standing invitation to drift — so the
// canonical one in `ui/shared` gained the `action` slot and this file is a
// re-export kept only so the path stays valid.
export { EmptyState } from "@/components/ui/shared";
