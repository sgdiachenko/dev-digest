/* AppShell.tsx — thin orchestrator: wires @devdigest/ui AppFrame to the command
   palette, shortcuts help, global keyboard shortcuts, and the shell context.
   All concerns live in ./hooks; overlay open/close is local view state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppFrame, CommandPalette, ShortcutsHelp, type Crumb } from "@devdigest/ui";
import { useGlobalShortcuts, useShellCommands, useShellContext } from "./hooks";
import styles from "./AppShell.module.css";

export function AppShell({ children, crumb }: { children: React.ReactNode; crumb?: Crumb[] }) {
  const t = useTranslations("shell");
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const mobileMenuRef = React.useRef<HTMLButtonElement>(null);
  const closeMobileNav = () => {
    setMobileNavOpen(false);
    mobileMenuRef.current?.focus();
  };
  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const closePalette = React.useCallback(() => setPaletteOpen(false), []);
  const openHelp = React.useCallback(() => setHelpOpen(true), []);
  const closeHelp = React.useCallback(() => setHelpOpen(false), []);

  useGlobalShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp });
  const commands = useShellCommands();
  const ctx = useShellContext({ onOpenCommandPalette: openPalette });

  return (
    <>
      <div className={styles.frame} data-nav-open={mobileNavOpen} onKeyDown={(event) => {
        if (event.key === "Escape" && mobileNavOpen) closeMobileNav();
      }}>
        <button
          type="button"
          ref={mobileMenuRef}
          className={styles.menuButton}
          aria-label={mobileNavOpen ? t("navigation.close") : t("navigation.open")}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span aria-hidden="true">{mobileNavOpen ? "×" : "☰"}</span>
        </button>
        {mobileNavOpen && <button type="button" className={styles.scrim} aria-label={t("navigation.close")} onClick={closeMobileNav} />}
        <AppFrame ctx={ctx} crumb={crumb}>
          {children}
        </AppFrame>
      </div>
      <CommandPalette open={paletteOpen} commands={commands} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </>
  );
}
