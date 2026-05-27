import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const QUEUE_NAME = "notifications";

const connection = { url: REDIS_URL };

let _queue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection });
  }
  return _queue;
}

export interface NotificationJobData {
  tenantSlug: string;
  recipientPhone: string;
  language: string;
  templateKey: string;
  vars: Record<string, string>;
}

export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  const queue = getNotificationQueue();
  await queue.add("send", data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export function startNotificationWorker(): Worker {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      await dispatchNotification(job.data);
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    if (job) {
      console.error(`Notification job ${job.id} failed:`, err.message);
    }
  });

  return worker;
}

async function dispatchNotification(data: NotificationJobData): Promise<void> {
  const message = renderTemplate(data.templateKey, data.language, data.vars);

  if (process.env["NODE_ENV"] === "development") {
    console.log(`[DEV NOTIFICATION] ${data.recipientPhone}: ${message}`);
    return;
  }

  const whatsappToken = process.env["WHATSAPP_360_TOKEN"];
  const whatsappPhone = process.env["WHATSAPP_360_PHONE_NUMBER_ID"];

  if (!whatsappToken || !whatsappPhone) {
    console.warn("WhatsApp not configured — skipping notification dispatch");
    return;
  }

  const res = await fetch(
    `https://waba.360dialog.io/v1/messages`,
    {
      method: "POST",
      headers: {
        "D360-API-KEY": whatsappToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: data.recipientPhone,
        type: "text",
        text: { body: message },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`360dialog error ${res.status}: ${body}`);
  }
}

// ── Message templates ─────────────────────────────────────────────────────────

type Templates = Record<string, Record<string, string>>;

const TEMPLATES: Templates = {
  "application.submitted": {
    en: "Your land application (ref: {{ref}}) has been received by {{council}}. We will review it shortly.",
    nde: "Isicelo sakho somhlaba (ref: {{ref}}) sitholwe ngu{{council}}. Sizosibheka maduze.",
    nso: "Kgopelo ya gago ya lefatshe (ref: {{ref}}) e amogetšwe ke {{council}}. Re tla e nyakišiša ka pela.",
    ts: "Nkopelo ya wena ya misava (ref: {{ref}}) yi amukeriwile hi {{council}}. Hi ta yi hlawulisisa.",
  },
  "application.under_review": {
    en: "Your land application (ref: {{ref}}) is now under review by {{council}}.",
    nde: "Isicelo sakho somhlaba (ref: {{ref}}) manje sibhekwa ngu{{council}}.",
    nso: "Kgopelo ya gago ya lefatshe (ref: {{ref}}) e a nyakišišwa ke {{council}}.",
    ts: "Nkopelo ya wena ya misava (ref: {{ref}}) yi khandziiwile hi {{council}}.",
  },
  "application.approved": {
    en: "Great news! Your land application (ref: {{ref}}) has been approved by {{council}}. Your PTO will be issued shortly.",
    nde: "Izindaba ezimnandi! Isicelo sakho somhlaba (ref: {{ref}}) samukelwe ngu{{council}}. I-PTO yakho izokhishwa maduze.",
    nso: "Ditaba tše botse! Kgopelo ya gago ya lefatshe (ref: {{ref}}) e dumeletšwe ke {{council}}. PTO ya gago e tla fiwa ka pela.",
    ts: "Mahungu lamanene! Nkopelo ya wena ya misava (ref: {{ref}}) yi pfuneriwile hi {{council}}. PTO ya wena yi ta nyikiwa.",
  },
  "application.rejected": {
    en: "Your land application (ref: {{ref}}) was not approved by {{council}}. Reason: {{notes}}. Contact {{council}} for more information.",
    nde: "Isicelo sakho somhlaba (ref: {{ref}}) asizange samukelwe ngu{{council}}. Isizathu: {{notes}}.",
    nso: "Kgopelo ya gago ya lefatshe (ref: {{ref}}) ga ya dumelelwa ke {{council}}. Lebaka: {{notes}}.",
    ts: "Nkopelo ya wena ya misava (ref: {{ref}}) a yi pfuneriwanga hi {{council}}. Xikonko: {{notes}}.",
  },
  "application.deferred": {
    en: "Your land application (ref: {{ref}}) has been deferred by {{council}}. Reason: {{notes}}. They will be in touch.",
    nde: "Isicelo sakho somhlaba (ref: {{ref}}) si bekelwe emuva ngu{{council}}. Isizathu: {{notes}}.",
    nso: "Kgopelo ya gago ya lefatshe (ref: {{ref}}) e betlwetšwe ntle ke {{council}}. Lebaka: {{notes}}.",
    ts: "Nkopelo ya wena ya misava (ref: {{ref}}) yi kongomisiwe hi {{council}}. Xikonko: {{notes}}.",
  },
};

function renderTemplate(key: string, language: string, vars: Record<string, string>): string {
  const templateSet = TEMPLATES[key];
  if (!templateSet) return `Notification: ${key}`;

  const template = templateSet[language] ?? templateSet["en"] ?? `Notification: ${key}`;
  return template.replace(/\{\{(\w+)\}\}/g, (_, v: string) => vars[v] ?? `{{${v}}}`);
}
