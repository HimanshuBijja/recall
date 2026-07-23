import { readSettings } from "@/lib/settings";
import { SettingsView } from "./SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings();
  return <SettingsView initial={settings} />;
}
