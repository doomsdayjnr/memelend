import prisma from "../db/client";
import { processBuyEvent } from "../routes/events/processBuyEvent";
import { processCloseShortEvent } from "../routes/events/processCloseShortEvent";
import { processSellEvent } from "../routes/events/processSellEvent";
import { processShortEvent } from "../routes/events/processShortEvent";

async function processRawEvents() {
  const pending = await prisma.rawEvent.findMany({
    where: { processed: false },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  for (const ev of pending) {
    try {
      const event = ev.data as any;

      if (ev.type === "buy") {
        await processBuyEvent(ev.sig, event);
      } 
      else if (ev.type === "sell") { await processSellEvent(ev.sig, event); }
      else if (ev.type === "short") { await processShortEvent(ev.sig, event); }
      else if (ev.type === "close") { await processCloseShortEvent(ev.sig, event); }
      // add other event types here...

      await prisma.rawEvent.update({
        where: { id: ev.id },
        data: { processed: true, processedAt: new Date() },
      });

      console.log(`✅ Processed ${ev.type} event ${ev.sig}`);
    } catch (err) {
      console.error(`❌ Failed processing event ${ev.sig}`, err);
    }
  }
}

setInterval(processRawEvents, 1000); // every second
