import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const SOURCE = process.env.SES_SOURCE_EMAIL || "";
const ses = SOURCE ? new SESv2Client({}) : null;

function renderHtml(order) {
  const items = (order.items ?? [])
    .map((it) => `<li><code>${it.sku}</code> × ${it.quantity}</li>`)
    .join("");
  return `
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color:#cdd9e5; background:#1c2128; padding:24px">
  <h2>Order ${order.order_id}</h2>
  <p>Status: confirmed.</p>
  <ul>${items}</ul>
  <p><strong>Total:</strong> $${Number(order.total ?? 0).toFixed(2)}</p>
</body></html>`;
}

export const handler = async (event) => {
  if (!ses) {
    console.error("SES_SOURCE_EMAIL not configured — skipping email send");
    return { batchItemFailures: [] };
  }
  for (const record of event.Records ?? []) {
    try {
      const msg = JSON.parse(record.body);
      const to = msg.to;
      if (!to) continue;
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: SOURCE,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: `Order ${msg.order_id} confirmed` },
              Body: {
                Html: { Data: renderHtml(msg) },
                Text: { Data: `Order ${msg.order_id} confirmed. Total $${msg.total}.` },
              },
            },
          },
        })
      );
    } catch (err) {
      console.error("email send failed", { err: err?.message });
    }
  }
  return { batchItemFailures: [] };
};
