/* IntentCard — Overview tab. Shows the derived PR intent (Intent Layer):
   the one-sentence intent, confidence, in/out of scope, and its sources
   (which were actually read). Derive/Re-derive triggers a synchronous
   re-derivation via POST /pulls/:id/intent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { confidenceColor } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("brief");
  const { data: record, isLoading, isError, refetch } = usePrIntent(prId);
  const deriveMutation = useDeriveIntent(prId);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const sourcesId = React.useId();

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <Card>
          <Skeleton height={60} />
        </Card>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <Card>
          <ErrorState title={t("intent.error.title")} onRetry={() => refetch()} />
        </Card>
      </section>
    );
  }

  if (!record) {
    return (
      <section>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <Card>
          <EmptyState
            icon="Target"
            title={t("intent.empty.title")}
            body={t("intent.empty.body")}
            cta={t("intent.derive")}
            onCta={() => deriveMutation.mutate()}
            ctaLoading={deriveMutation.isPending}
          />
        </Card>
      </section>
    );
  }

  const conf = confidenceColor(record.confidence);

  return (
    <section>
      <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
      <Card style={s.card}>
        <div style={s.header}>
          <div style={s.headerLeft}>
            <Badge color={conf.color} bg={conf.bg}>
              {t(`intent.confidence.${record.confidence}`)}
            </Badge>
            {record.stale && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("intent.stale")}
              </Badge>
            )}
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            onClick={() => deriveMutation.mutate()}
            loading={deriveMutation.isPending}
          >
            {deriveMutation.isPending ? t("intent.deriving") : t("intent.rederive")}
          </Button>
        </div>

        {record.confidence === "low" && <div style={s.scopeEmpty}>{t("intent.lowConfidenceHint")}</div>}

        <p style={s.quote}>{record.intent}</p>

        <div style={s.scopeGrid}>
          <div style={s.scopeCol}>
            <span style={s.scopeLabel}>{t("intent.inScope")}</span>
            {record.in_scope.length === 0 ? (
              <span style={s.scopeEmpty}>{t("intent.noScope")}</span>
            ) : (
              <ul style={s.scopeList}>
                {record.in_scope.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div style={s.scopeCol}>
            <span style={s.scopeLabel}>{t("intent.outOfScope")}</span>
            {record.out_of_scope.length === 0 ? (
              <span style={s.scopeEmpty}>{t("intent.noScope")}</span>
            ) : (
              <ul style={s.scopeList}>
                {record.out_of_scope.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <button
            type="button"
            style={s.sourcesToggle}
            aria-expanded={sourcesOpen}
            aria-controls={sourcesId}
            onClick={() => setSourcesOpen((v) => !v)}
          >
            <Icon.ChevronDown
              size={14}
              style={{ transform: sourcesOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .12s" }}
            />
            {t("intent.sources", { count: record.sources.length })}
          </button>
          {sourcesOpen && (
            <div id={sourcesId} style={s.sourcesList}>
              {record.sources.map((src, i) => {
                const R = src.resolved ? Icon.CheckCircle : Icon.XCircle;
                return (
                  <div key={i} style={s.sourceRow}>
                    <R size={13} color={src.resolved ? "var(--ok)" : "var(--text-muted)"} />
                    <span className="mono" style={s.sourceRef}>
                      {src.ref}
                    </span>
                    <span>{src.resolved ? t("intent.sourceResolved") : t("intent.sourceUnresolved")}</span>
                    {src.note && <span style={s.sourceNote}>({src.note})</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
