const express = require("express");
const multer = require("multer");
const axios = require("axios");
const crypto = require("crypto");
const mime = require("mime-types");
const FormData = require("form-data");

const app = express();

// =======================
// MULTER
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// =======================
// CONFIG
// =======================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = "IkyyExecutive-v2";
const GITHUB_REPO = "IkyySukaNgewe";
const GITHUB_BRANCH = "main";

const UGUU_API = "https://uguu.se/upload.php";

// =======================
// MEMORY MAP (fallback)
// =======================
const uguuMap = {};

// =======================
// UTILS
// =======================
function generateId() {
  return crypto.randomBytes(32).toString("hex");
}

function randomName(ext) {
  return crypto.randomBytes(16).toString("hex") + "." + ext;
}

function randomToken() {
  return crypto.randomBytes(6).toString("hex");
}

function getBaseUrl(req) {
  return `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
}

// =======================
// ROOT
// =======================
app.get("/", (req, res) => {
  res.send("CDN ACTIVE");
});

// =======================
// UPLOAD V1 (FIX: NO MEMORY, DIRECT UGUU)
// =======================
app.post("/upload/v1", upload.single("file"), async (req, res) => {
  try {
    let buffer;
    let filename;

    if (req.file) {
      buffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body.url) {
      const response = await axios.get(req.body.url, {
        responseType: "arraybuffer"
      });
      buffer = response.data;
      filename = "file";
    } else {
      return res.status(400).json({ error: "No file or url" });
    }

    const form = new FormData();
    form.append("files[]", buffer, filename);

    const uguuRes = await axios.post(UGUU_API, form, {
      headers: form.getHeaders()
    });

    const realUrl = uguuRes.data.files[0].url;

    const fakeName = randomName("bin");
    const token = randomToken();

    uguuMap[fakeName] = { url: realUrl };

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      url: `${baseUrl}/api/upload/${fakeName}/${token}?preview=true`
    });

  } catch (err) {
    res.status(500).json({ error: "Upload gagal" });
  }
});

// =======================
// GITHUB UPLOAD
// =======================
app.post("/uploads", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const ext = req.file.originalname.split(".").pop();
    const id = generateId();

    const content = req.file.buffer.toString("base64");

    await axios.put(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/storage/${id}.${ext}`,
      {
        message: `Upload ${id}`,
        content,
        branch: GITHUB_BRANCH
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`
        }
      }
    );

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      url: `${baseUrl}/storage/${id}.${ext}`
    });

  } catch (err) {
    res.status(500).json({ error: "Upload gagal" });
  }
});

// =======================
// UGUU DIRECT
// =======================
app.post("/api/upload.php", upload.single("file"), async (req, res) => {
  try {
    const form = new FormData();
    form.append("files[]", req.file.buffer, req.file.originalname);

    const uguuRes = await axios.post(UGUU_API, form, {
      headers: form.getHeaders()
    });

    const realUrl = uguuRes.data.files[0].url;

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      direct: realUrl,
      url: realUrl
    });

  } catch {
    res.status(500).json({ error: "UGUU gagal" });
  }
});

// =======================
// STORAGE PROXY (GITHUB)
// =======================
app.get("/storage/:filename", async (req, res) => {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/storage/${req.params.filename}`;

    const response = await axios.get(rawUrl, {
      responseType: "stream"
    });

    res.setHeader(
      "Content-Type",
      mime.lookup(req.params.filename) || "application/octet-stream"
    );

    response.data.pipe(res);

  } catch {
    res.status(404).send("Not found");
  }
});

// =======================
// UGUU PROXY
// =======================
app.get("/api/upload/:file/:token", async (req, res) => {
  const data = uguuMap[req.params.file];
  if (!data) return res.status(404).send("Not found");

  const response = await axios.get(data.url, {
    responseType: "stream"
  });

  if (req.query.preview === "true") {
    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "application/octet-stream"
    );
  } else {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.params.file}"`
    );
  }

  response.data.pipe(res);
});

// =======================
// EXPORT
// =======================
module.exports = app;
