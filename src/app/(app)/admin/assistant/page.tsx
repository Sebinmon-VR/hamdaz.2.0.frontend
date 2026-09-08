"use client";

import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { Check, KeyRound, Loader2, Play, Save, ShieldAlert, Sparkles, Square } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { useVoiceOptions } from "@/lib/assistant";
import { useSpeaker } from "@/lib/speech";
import type {
  AssistantModelOut,
  AssistantSettingsIn,
  AssistantSettingsOut,
} from "@/lib/types";
import { Badge, PageHead, Panel, PanelHead } from "@/components/ui/primitives";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui/controls";
import { Empty, ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { AssistantAdminNav } from "@/components/assistant/AdminNav";

/**
 * The assistant's switches.
 *
 * **Super admin only, and that is narrower than it looks.** The backend does not
 * use its usual `ADMIN_ROLES` here: a CEO or a manager gets a 403 on every route
 * behind this screen, on the stated grounds that deciding what an assistant may
 * do on everybody's behalf is a different question from running a team. So the
 * gate below checks `is_super_admin` rather than `is_admin`, and matches what
 * the endpoints will actually say.
 *
 * The master switch is off until somebody turns it on, deliberately: an
 * assistant nobody has configured should not be reachable by anyone, super
 * admins included. Which means this screen is the first stop, not an
 * afterthought — nothing else in the module works until it has been visited.
 */
export default function AssistantSettingsPage() {
  const session = useSession();
  const settings = useSWR<AssistantSettingsOut>("/assistant/admin/settings", {
    revalidateOnFocus: false,
  });
  const models = useSWR<AssistantModelOut[]>("/assistant/admin/models", {
    revalidateOnFocus: false,
  });

  if (!session.roles.is_super_admin) {
    return (
      <>
        <PageHead eyebrow="Administration" title="Assistant" />
        <Empty
          icon={ShieldAlert}
          title="Super admin only"
          body="Configuring the assistant is limited to super admins — deliberately narrower than the admin role used elsewhere, because this decides what it may do on everyone's behalf."
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Assistant"
        lead="What it runs on, who it answers, and what it costs."
        meta={settings.data ? `saved ${dateTime(settings.data.updated_at)}` : undefined}
      />

      <AssistantAdminNav />

      {settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.mutate()} />
      ) : !settings.data ? (
        <PanelSkeleton lines={8} />
      ) : (
        <Editor
          settings={settings.data}
          models={models.data ?? []}
          onSaved={() => {
            void settings.mutate();
            void models.mutate();
          }}
        />
      )}
    </>
  );
}

function Editor({
  settings,
  models,
  onSaved,
}: {
  settings: AssistantSettingsOut;
  models: AssistantModelOut[];
  onSaved: () => void;
}) {
  // The draft is seeded once per server payload. Re-seeding on every render
  // would throw away what somebody is in the middle of typing the moment any
  // other request revalidated.
  const [draft, setDraft] = useState<AssistantSettingsOut>(settings);
  const [seen, setSeen] = useState(settings.updated_at);
  const [saved, setSaved] = useState(false);

  if (seen !== settings.updated_at) {
    setSeen(settings.updated_at);
    setDraft(settings);
  }

  const set = <K extends keyof AssistantSettingsOut>(key: K, value: AssistantSettingsOut[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = useAction(async () => {
    const body: AssistantSettingsIn = {
      enabled: draft.enabled,
      model_key: draft.model_key,
      reasoning_effort: draft.reasoning_effort,
      max_tool_rounds: draft.max_tool_rounds,
      max_output_tokens: draft.max_output_tokens,
      history_window: draft.history_window,
      turns_per_user_per_hour: draft.turns_per_user_per_hour,
      // An empty box means "no cap", which the backend spells as null. Sending
      // "" would be a 422 about a decimal, which names nothing useful.
      daily_cost_cap_user_usd: blank(draft.daily_cost_cap_user_usd),
      daily_cost_cap_total_usd: blank(draft.daily_cost_cap_total_usd),
      audience_mode: draft.audience_mode,
      confirm_writes_default: draft.confirm_writes_default,
      voice_enabled: draft.voice_enabled,
      realtime_enabled: draft.realtime_enabled,
      realtime_model: draft.realtime_model,
      realtime_writes_enabled: draft.realtime_writes_enabled,
      voice_model: draft.voice_model,
      voice: draft.voice,
      // Blank restores the shipped wording rather than removing steering, which
      // is what the backend does with a null — so an emptied box is a reset.
      voice_instructions: draft.voice_instructions?.trim() || null,
      extra_instructions: draft.extra_instructions?.trim() || null,
    };
    await api.patch<AssistantSettingsOut>("/assistant/admin/settings", body);
    setSaved(true);
    onSaved();
  });

  const active = models.find((model) => model.key === draft.model_key);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="space-y-4">
      {!settings.openai_configured && (
        <InlineNotice tone="danger">
          There is no OpenAI API key on the server, so every turn will fail with a 503
          however this screen is set. Set <code>OPENAI_API_KEY</code> in the backend
          environment and restart it.
        </InlineNotice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* ── on, and for whom ─────────────────────────────────── */}
          <Panel className="p-5">
            <PanelHead
              title="Availability"
              hint="Off by default — an assistant nobody has configured should reach nobody"
            />
            <div className="mt-5 space-y-5">
              <Toggle
                checked={draft.enabled}
                onChange={(value) => set("enabled", value)}
                label="The assistant is on"
                hint="The master switch. Off refuses every chat route with a sentence saying so, super admins included."
              />

              <div>
                <p className="mb-2 text-[12px] text-ink-3">Who can reach it</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ModeCard
                    on={draft.audience_mode === "allow_list"}
                    onSelect={() => set("audience_mode", "allow_list")}
                    title="Released to a list"
                    body="Nobody without a matching allow rule. How it is given to one team at a time."
                  />
                  <ModeCard
                    on={draft.audience_mode === "everyone"}
                    onSelect={() => set("audience_mode", "everyone")}
                    title="Everyone signed in"
                    body="Allow rules stop doing anything; block rules take individuals away."
                  />
                </div>
                <p className="mt-2 text-[11.5px] text-ink-4">
                  Rules are set under{" "}
                  <a href="/admin/assistant/access" className="text-accent-text underline underline-offset-2">
                    Access rules
                  </a>
                  . A block always beats an allow.
                </p>
              </div>

              <Toggle
                checked={draft.voice_enabled}
                onChange={(value) => set("voice_enabled", value)}
                label="Voice"
                hint="Offers the hands-free screen and a speaker on every answer. What people say is recognised in their own browser and never uploaded; what the assistant says back is generated here, and billed."
              />
            </div>
          </Panel>

          <VoicePanel draft={draft} set={set} />

          <RealtimePanel draft={draft} set={set} />

          {/* ── what it may do without asking ────────────────────── */}
          <Panel className="p-5">
            <PanelHead title="Writes" hint="What a module inherits when it does not say" />
            <div className="mt-5">
              <Toggle
                checked={draft.confirm_writes_default}
                onChange={(value) => set("confirm_writes_default", value)}
                label="Ask before every write"
                hint="A write stops the turn and shows the person exactly what would be sent. Turning this off makes writes immediate wherever a module or tool has not overridden it — worth doing per tool rather than globally."
              />
              {!draft.confirm_writes_default && (
                <InlineNotice tone="warn" className="mt-4">
                  With this off, any enabled write runs the moment the model asks for it.
                  Writes still go through the person&rsquo;s own permissions, so nobody gains
                  a right they did not have — but nobody is asked first either.
                </InlineNotice>
              )}
            </div>
          </Panel>

          {/* ── house rules ──────────────────────────────────────── */}
          <Panel className="p-5">
            <PanelHead title="House rules" hint="Appended to the system prompt, verbatim" />
            <Field
              className="mt-4"
              hint="Tone, what to avoid, anything specific to this company. Left empty for the assistant's own instructions alone."
            >
              <Textarea
                value={draft.extra_instructions ?? ""}
                onChange={(event) => set("extra_instructions", event.target.value)}
                maxLength={8000}
                placeholder="Always give amounts in AED unless asked otherwise."
                className="min-h-32"
              />
            </Field>
          </Panel>
        </div>

        <div className="space-y-4">
          {/* ── the model ────────────────────────────────────────── */}
          <Panel className="p-5">
            <PanelHead title="Model" />
            <div className="mt-4 space-y-3">
              <Field label="Answers with">
                <Select
                  value={draft.model_key}
                  onChange={(event) => set("model_key", event.target.value)}
                >
                  {models.map((model) => (
                    <option key={model.key} value={model.key} disabled={!model.enabled}>
                      {model.name}
                      {model.enabled ? "" : " — disabled"}
                    </option>
                  ))}
                  {/* The settings can point at a model that is no longer in the
                      list, and a select that silently drops it would look like
                      somebody else had changed the setting. */}
                  {!models.some((model) => model.key === draft.model_key) && (
                    <option value={draft.model_key}>{draft.model_key} — not in the list</option>
                  )}
                </Select>
              </Field>

              {active && (
                <div className="rounded-[13px] bg-panel-2 p-3.5">
                  <p className="text-[12px] leading-relaxed text-ink-3">{active.description}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <Price label="In" value={active.input_price} />
                    <Price label="Cached" value={active.cached_input_price} />
                    <Price label="Out" value={active.output_price} />
                  </dl>
                  <p className="mt-2 text-[10.5px] text-ink-4">
                    USD per million tokens. Every cost figure in this module is computed from
                    these, so a stale price makes them all quietly wrong.
                  </p>
                </div>
              )}

              <Field
                label="Reasoning effort"
                hint="Which of these a model honours is the model's business; an invalid pairing comes back as a clear error from OpenAI."
              >
                <Select
                  value={draft.reasoning_effort}
                  onChange={(event) => set("reasoning_effort", event.target.value)}
                >
                  {["none", "minimal", "low", "medium", "high", "xhigh", "max"].map((effort) => (
                    <option key={effort} value={effort}>
                      {humanise(effort)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>

          {/* ── limits ───────────────────────────────────────────── */}
          <Panel className="p-5">
            <PanelHead title="Limits" hint="Checked before a turn starts" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Tool rounds" hint="1–30">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.max_tool_rounds}
                  onChange={(event) => set("max_tool_rounds", Number(event.target.value))}
                />
              </Field>
              <Field label="Output tokens" hint="256–64000">
                <Input
                  type="number"
                  min={256}
                  max={64000}
                  value={draft.max_output_tokens}
                  onChange={(event) => set("max_output_tokens", Number(event.target.value))}
                />
              </Field>
              <Field label="History carried" hint="Earlier messages, 0–200">
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={draft.history_window}
                  onChange={(event) => set("history_window", Number(event.target.value))}
                />
              </Field>
              <Field label="Turns per hour" hint="Each person">
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.turns_per_user_per_hour}
                  onChange={(event) => set("turns_per_user_per_hour", Number(event.target.value))}
                />
              </Field>
              <Field label="Daily cap, one person" hint="USD. Empty for none.">
                <Input
                  inputMode="decimal"
                  value={draft.daily_cost_cap_user_usd ?? ""}
                  onChange={(event) => set("daily_cost_cap_user_usd", event.target.value)}
                  placeholder="No cap"
                />
              </Field>
              <Field label="Daily cap, everyone" hint="USD. Empty for none.">
                <Input
                  inputMode="decimal"
                  value={draft.daily_cost_cap_total_usd ?? ""}
                  onChange={(event) => set("daily_cost_cap_total_usd", event.target.value)}
                  placeholder="No cap"
                />
              </Field>
            </div>
          </Panel>

          <Panel className="p-5">
            <PanelHead title="Where to go next" />
            <div className="mt-3 space-y-1.5">
              <NextLink
                href="/admin/assistant/permissions"
                icon={Sparkles}
                label="What it may read and write"
                hint="Per module and per tool"
              />
              <NextLink
                href="/admin/assistant/access"
                icon={KeyRound}
                label="Who it is released to"
                hint="Allow and block rules"
              />
            </div>
          </Panel>
        </div>
      </div>

      {/* Sticky rather than at the foot of a long form: on a screen this tall
          the save button was below the fold for every field above it. */}
      <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-[20px] bg-panel px-5 py-3.5 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">
          {save.error ? (
            <span className="text-danger">{save.error}</span>
          ) : saved && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-positive">
              <Check className="size-3.5" strokeWidth={2.6} />
              Saved. It applies to the next turn anybody takes.
            </span>
          ) : dirty ? (
            "Unsaved changes."
          ) : (
            "Everything here is saved."
          )}
        </p>
        <Button
          variant="accent"
          icon={Save}
          loading={save.pending}
          disabled={!dirty}
          onClick={() => void save.run()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/* ── the spoken conversation ─────────────────────────────────────────── */


/**
 * A spoken conversation, and why it is switched on separately from the voice.
 *
 * They are different arrangements, not two settings for one feature. Reading an
 * answer aloud is this app's loop: the chat answers in text and a speech model
 * reads it out, so every turn passes through the same checks as a typed one. A
 * spoken conversation is **OpenAI's** loop — the browser connects straight to
 * them and audio flows both ways continuously, which is what lets somebody
 * interrupt it mid-sentence and what makes it feel like a conversation.
 *
 * The access model survives that because the session is furnished here: the
 * model, the voice, the instructions and the tool list are all fixed when the
 * token is minted, and every tool the model asks for comes back to this API to
 * be checked and run as the person asking. A tampered browser cannot give
 * itself a tool.
 *
 * **What is genuinely weaker is the confirmation**, and it has its own switch
 * for that reason. In the chat the server parks the run and nothing happens
 * until a person answers. In a spoken conversation the server refuses a
 * confirmable write once and tells the model to ask out loud — and it is the
 * model that judges the answer. An administrator should have to accept that
 * before a spoken word can change data, so writes are off until they do.
 */
function RealtimePanel({
  draft,
  set,
}: {
  draft: AssistantSettingsOut;
  set: <K extends keyof AssistantSettingsOut>(key: K, value: AssistantSettingsOut[K]) => void;
}) {
  const options = useVoiceOptions();
  // Served by `/assistant/voices` now, so this screen no longer keeps its own
  // copy to fall out of step. A configured model missing from the list is still
  // shown rather than silently dropped, so a newer backend does not read as a
  // broken setting.
  const offered = options.data?.realtime_models ?? [];
  const models = offered.includes(draft.realtime_model)
    ? offered
    : [draft.realtime_model, ...offered];

  return (
    <Panel className="p-5">
      <PanelHead
        title="Spoken conversation"
        hint="OpenAI's loop, not ours — and billed by them directly"
      />

      <div className="mt-5 space-y-5">
        <Toggle
          checked={draft.realtime_enabled}
          onChange={(value) => set("realtime_enabled", value)}
          label="People can talk to it"
          hint="Opens a live audio connection from the browser to OpenAI. It can be interrupted mid-sentence and answers without waiting for a round trip through this app. Its cost is not reported back to us, so it does not appear on the usage screen."
        />

        {draft.realtime_enabled && (
          <>
            <Field
              label="Realtime model"
              hint="The mini variants cost less and answer sooner. Which is right is a judgement made by listening, not reading."
            >
              <Select
                value={draft.realtime_model}
                onChange={(event) => set("realtime_model", event.target.value)}
              >
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </Select>
            </Field>

            <p className="text-[11.5px] leading-relaxed text-ink-4">
              It speaks in the voice chosen above. The tool list and the instructions are
              fixed when each session is opened, so a browser cannot give itself a tool the
              person may not use, and every tool it calls is run here as them.
            </p>

            <Toggle
              checked={draft.realtime_writes_enabled}
              onChange={(value) => set("realtime_writes_enabled", value)}
              label="It may change data while talking"
              hint="Off by default, and separate from the writes switch above, because a spoken conversation confirms differently."
            />

            {draft.realtime_writes_enabled ? (
              <InlineNotice tone="warn">
                In the chat, a write that needs approving <strong>parks the run</strong> and
                nothing happens until somebody answers. In a spoken conversation the model
                asks out loud and judges the answer itself — so what stands between a
                misheard yes and a real change is the model, not this server. Writes still
                run as the person asking and cannot exceed their own permissions.
              </InlineNotice>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-ink-4">
                With this off, a spoken conversation is read-only: write tools are left out
                of the session entirely rather than refused when asked for.
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

/* ── the voice ───────────────────────────────────────────────────────── */

/**
 * Which voice reads answers back, and how it should sound.
 *
 * This screen exists because the assistant no longer uses the browser's built-in
 * speech. Those voices are whatever the operating system ships, they differ on
 * every machine, and on most of them the reading is flat enough that people stop
 * pressing the button — so a speech model reads instead, and it sounds the same
 * for everyone. The cost of that is real and worth knowing before switching it
 * on for a whole company: this is generated on request and billed per character,
 * where the browser's was free and local.
 *
 * **The voices are unlabelled on purpose.** How one sounds is not a judgement
 * anybody should make from a name, and the backend says exactly that where it
 * lists them. So each has a play button and they all say the same sentence,
 * which is the only way to actually choose between them.
 *
 * Sampling is a super admin power on the backend — `POST /assistant/speech`
 * refuses a `voice` override from anybody else — which is the right shape for a
 * control that already lives behind this gate.
 */

/** One sentence, said by every voice: a number, an identifier and a day. */
const VOICE_SAMPLE =
  "You have four days of leave left this year, and quote Q-2043 has been waiting on your approval since Tuesday.";

function VoicePanel({
  draft,
  set,
}: {
  draft: AssistantSettingsOut;
  set: <K extends keyof AssistantSettingsOut>(key: K, value: AssistantSettingsOut[K]) => void;
}) {
  const options = useVoiceOptions();
  const speaker = useSpeaker();
  const [sampling, setSampling] = useState<string | null>(null);

  function sample(voice: string) {
    if (sampling === voice && speaker.speaking) {
      speaker.cancel();
      setSampling(null);
      return;
    }
    setSampling(voice);
    speaker.speak(VOICE_SAMPLE, { voice });
  }

  // The list comes from the backend, so a voice added there appears here with no
  // deploy. A configured voice that has since been dropped from it is called out
  // rather than quietly reading as something else.
  const known = (options.data?.voices ?? []).some((entry) => entry.key === draft.voice);

  return (
    <Panel className="p-5">
      <PanelHead
        title="The voice"
        hint={options.data ? `${options.data.voices.length} to choose from` : undefined}
      />

      {!draft.voice_enabled && (
        <p className="mt-4 text-[12px] leading-relaxed text-ink-4">
          The voice is switched off above, so none of this is in use yet. It can still be
          set up and sampled here.
        </p>
      )}

      <div className="mt-5 space-y-5">
        <div>
          <p className="mb-2 text-[12px] text-ink-3">Voice</p>
          {!options.data ? (
            <p className="text-[12px] text-ink-4">Reading the list…</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {options.data.voices.map((entry) => {
                const on = entry.key === draft.voice;
                const playing = sampling === entry.key && speaker.speaking;
                const loading = sampling === entry.key && !speaker.speaking;
                return (
                  <div
                    key={entry.key}
                    className={clsx(
                      "flex items-center gap-2 rounded-[13px] py-1.5 pl-3.5 pr-1.5 transition",
                      on ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-2",
                    )}
                  >
                    <button
                      onClick={() => set("voice", entry.key)}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium capitalize"
                    >
                      {entry.key}
                    </button>
                    {on && <Check className="size-3.5 shrink-0" strokeWidth={2.8} />}
                    <button
                      onClick={() => sample(entry.key)}
                      aria-label={playing ? `Stop ${entry.key}` : `Hear ${entry.key}`}
                      title={playing ? "Stop" : "Hear this voice"}
                      className={clsx(
                        "grid size-7 shrink-0 place-items-center rounded-full transition",
                        on ? "hover:bg-black/10" : "text-ink-3 hover:bg-panel-3 hover:text-ink",
                      )}
                    >
                      {playing ? (
                        <Square className="size-3" strokeWidth={2.4} />
                      ) : loading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" strokeWidth={2.2} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {options.data && !known && (
            <p className="mt-2 text-[11.5px] text-warn">
              The configured voice is &ldquo;{draft.voice}&rdquo;, which is not in this
              list. Pick one above, or reading an answer aloud will fail.
            </p>
          )}
          {speaker.error && <p className="mt-2 text-[11.5px] text-danger">{speaker.error}</p>}
        </div>

        <Field
          label="Speech model"
          hint="Only gpt-4o-mini-tts acts on the direction below. The tts-1 pair ignore it rather than failing, and cost less."
        >
          <Select
            value={draft.voice_model}
            onChange={(event) => set("voice_model", event.target.value)}
          >
            {(options.data?.speech_models ?? [draft.voice_model]).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="How it should sound"
          hint="Pace, warmth, what to slow down for. Emptying the box restores the shipped wording rather than removing direction. A sample uses what is saved, so save before listening."
        >
          <Textarea
            value={draft.voice_instructions ?? ""}
            onChange={(event) => set("voice_instructions", event.target.value)}
            maxLength={2000}
            placeholder={options.data?.instructions ?? ""}
            className="min-h-28"
          />
        </Field>
      </div>
    </Panel>
  );
}

/** "" and whitespace both mean no cap, which the backend spells as null. */
function blank(value: string | null): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

function Price({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="micro text-ink-4">{label}</dt>
      <dd className="tnum mt-1 text-[12.5px] font-semibold">${value}</dd>
    </div>
  );
}

function ModeCard({
  on,
  onSelect,
  title,
  body,
}: {
  on: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={on}
      className={clsx(
        "rounded-[13px] p-3.5 text-left transition",
        on ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-2 hover:bg-panel-3",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        {on && <Check className="size-3.5" strokeWidth={2.8} />}
      </span>
      <span
        className={clsx(
          "mt-1 block text-[11.5px] leading-relaxed",
          on ? "opacity-80" : "text-ink-4",
        )}
      >
        {body}
      </span>
    </button>
  );
}

function NextLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-[13px] px-3 py-2.5 transition hover:bg-panel-2"
    >
      <Icon className="size-4 shrink-0 text-ink-4" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-ink-4">{hint}</span>
      </span>
      <Badge tone="neutral">Open</Badge>
    </a>
  );
}
