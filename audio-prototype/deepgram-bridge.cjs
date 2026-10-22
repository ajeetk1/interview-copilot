
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const apiKey = process.env.DEEPGRAM_API_KEY;

if (!apiKey) {
  const message = "DEEPGRAM_API_KEY is missing. Add it to the project .env file.";
  console.error(message);
  process.stdout.write(JSON.stringify({ type: "error", message }) + "\n");
  process.exit(1);
}

const url = new URL("wss://api.deepgram.com/v1/listen");
url.searchParams.set("model", "nova-3");
url.searchParams.set("language", "en-US");
url.searchParams.set("encoding", "linear16");
url.searchParams.set("sample_rate", "16000");
url.searchParams.set("channels", "1");
url.searchParams.set("interim_results", "true");
url.searchParams.set("smart_format", "true");
url.searchParams.set("endpointing", "300");
for (const term of [
  "ChatGPT",
  "OpenAI",
  "LLM",
  "RAG",
  "AI agent",
  "machine learning",
  "API",
]) {
  url.searchParams.append("keyterm", term);
}

const ws = new WebSocket(url.toString(), {
  headers: { Authorization: `Token ${apiKey}` },
  handshakeTimeout: 15000,
});

let streamer;
let stopping = false;
let finalizing = false;
let finalizeTimer;
let nextEventId = 1;
const seenFinalSegments = new Set();

function sendTranscript(type, text, segmentId, audioStart, audioDuration) {
  // One complete JSON message per line, so Electron can parse chunks safely.
  process.stdout.write(
    JSON.stringify({
      type,
      text,
      segmentId,
      eventId: nextEventId++,
      audioStart,
      audioDuration,
    }) + "\n"
  );
}

function sendStatus(type, message) {
  process.stdout.write(JSON.stringify({ type, message }) + "\n");
}

function describeHandshakeStatus(statusCode) {
  if (statusCode === 401 || statusCode === 403) {
    return "Deepgram rejected the API key. Check DEEPGRAM_API_KEY.";
  }
  if (statusCode === 400) {
    return "Deepgram rejected the transcription options. Check the model and query parameters.";
  }
  if (statusCode === 429) {
    return "Deepgram rate limit or concurrency limit reached. Try again shortly.";
  }
  return `Deepgram rejected the WebSocket handshake (HTTP ${statusCode}).`;
}

ws.on("open", () => {
  if (stopping) {
    ws.close();
    return;
  }

  sendStatus("ready", "Connected to Deepgram.");
  console.error("Connected to Deepgram.");
  console.error("Starting system audio streamer...");

  streamer = spawn("./system-audio-streamer", [], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "inherit"],
  });

  streamer.stdout.on("data", (audioChunk) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(audioChunk);
    }
  });

  streamer.on("error", (error) => {
    const message = `Could not start audio streamer: ${error.message}`;
    sendStatus("error", message);
    console.error(message);
    stop();
  });

  streamer.on("close", (code) => {
    console.error(`Audio streamer exited with code ${code}`);
    stop();
  });
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());

    if (message.type === "Results") {
      const transcript =
        message.channel?.alternatives?.[0]?.transcript?.trim();

      if (transcript) {
        const isFinal = message.is_final === true;
        let segmentId;

        if (isFinal && Number.isFinite(message.start) && Number.isFinite(message.duration)) {
          const channel = Array.isArray(message.channel_index)
            ? message.channel_index.join(":")
            : "0";
          segmentId = [
            channel,
            message.start,
            message.duration,
            transcript.toLowerCase().replace(/\s+/g, " ").trim(),
          ].join("|");

          if (seenFinalSegments.has(segmentId)) return;
          seenFinalSegments.add(segmentId);
          if (seenFinalSegments.size > 5000) {
            seenFinalSegments.delete(seenFinalSegments.values().next().value);
          }
        }

        sendTranscript(
          isFinal ? "final" : "live",
          transcript,
          segmentId,
          Number.isFinite(message.start) ? message.start : undefined,
          Number.isFinite(message.duration) ? message.duration : undefined
        );
        if (finalizing && isFinal) {
          clearTimeout(finalizeTimer);
          ws.close();
        }
      }
    } else if (message.type === "Error") {
      console.error("Deepgram error:", JSON.stringify(message));
    }
  } catch (error) {
    console.error("Could not parse Deepgram message:", error.message);
  }
});

ws.on("error", (error) => {
  if (stopping) return;
  const message = `Deepgram WebSocket connection failed: ${error.message}`;
  sendStatus("error", message);
  console.error(message);
  stop();
});

ws.on("unexpected-response", (_request, response) => {
  const message = describeHandshakeStatus(response.statusCode);
  sendStatus("error", message);
  console.error(message);
  response.resume();
  stopping = true;
});

ws.on("close", (code, reason) => {
  if (!stopping) {
    console.error(`Deepgram connection closed: ${code} ${reason}`);
    stop();
  }
});

function stop() {
  if (stopping) return;
  stopping = true;

  const finalize = () => {
    if (finalizing) return;
    finalizing = true;

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "Finalize" }));
      finalizeTimer = setTimeout(() => ws.close(), 2000);
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  };

  if (streamer && streamer.exitCode === null && streamer.signalCode === null) {
    const fallbackTimer = setTimeout(finalize, 2000);
    streamer.once("close", () => {
      clearTimeout(fallbackTimer);
      finalize();
    });
    streamer.kill("SIGINT");
    return;
  }

  if (ws.readyState === WebSocket.CONNECTING) return;
  finalize();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
