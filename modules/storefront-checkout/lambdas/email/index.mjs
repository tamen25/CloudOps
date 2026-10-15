import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const SOURCE = process.env.SES_SOURCE_EMAIL || "";
const ses = SOURCE ? new SESv2Client({}) : null;

/* Closes #135 stored-HTML-injection finding. SKU + order_id flow from
 * tenant-controlled data and the SKU validator at the API boundary only
 * checks length, so we cannot trust either string in HTML context. */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(order) {
  const items = (order.items ?? [])
    .map(
      (it) =>
        `<li><code>${escapeHtml(it.sku)}</code> × ${Number(it.quantity) || 0}</li>`
    )
    .join("");
  const total = Number(order.total ?? 0).toFixed(2);
  return `
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color:#cdd9e5; background:#1c2128; padding:24px">
  <h2>Order ${escapeHtml(order.order_id)}</h2>
  <p>Status: confirmed.</p>
  <ul>${items}</ul>
  <p><strong>Total:</strong> $${total}</p>
</body></html>`;
}

export { escapeHtml, renderHtml };

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
