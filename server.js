const express = require("express");
const multer = require("multer");
const axios = require("axios");
const crypto = require("crypto");
const mime = require("mime-types");
const FormData = require("form-data");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// =======================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = "IkyyExecutive-v2";
const GITHUB_REPO = "IkyySukaNgewe";
const GITHUB_BRANCH = "main";

const JSON_PATH = "lib/proxy.json";
const UGUU_API = "https://uguu.se/upload.php";

// =======================
function randomName() {
  return crypto.randomBytes(16).toString("hex");
}

function randomToken() {
  return crypto.randomBytes(6).toString("hex");
}

function getBaseUrl(req) {
  return `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
}

// =======================
// 📥 GET JSON FROM GITHUB
// =======================
async function getProxyMap() {
  const res = await axios.get(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}`,
    {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    }
  );

  const content = Buffer.from(res.data.content, "base64").toString();
  return {
    data: JSON.parse(content),
    sha: res.data.sha
  };
}

// =======================
// 💾 SAVE JSON TO GITHUB
// =======================
async function saveProxyMap(newData, sha) {
  const content = Buffer.from(JSON.stringify(newData, null, 2)).toString("base64");

  await axios.put(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}`,
    {
      message: "update proxy map",
      content,
      sha,
      branch: GITHUB_BRANCH
    },
    {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    }
  );
}

// =======================
app.get("/", (req, res) => {
  res.send("CDN ACTIVE");
});

// =======================
// 🔥 UPLOAD (UGUU + SAVE JSON)
// =======================
app.post("/api/upload.php", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    // upload ke uguu
    const form = new FormData();
    form.append("files[]", req.file.buffer, req.file.originalname);

    const uguuRes = await axios.post(UGUU_API, form, {
      headers: form.getHeaders()
    });

    const realUrl = uguuRes.data.files[0].url;

    // generate key
    const fileId = randomName();
    const token = randomToken();

    // ambil json lama
    const { data, sha } = await getProxyMap();

    // simpan mapping
    data[fileId] = {
      url: realUrl,
      token,
      createdAt: Date.now()
    };

    await saveProxyMap(data, sha);

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      url: `${baseUrl}/api/upload/${fileId}/${token}?preview=true`
    });

  } catch (err) {
    console.log(err.response?.data || err.message);
    res.status(500).json({ error: "Upload gagal" });
  }
});

// =======================
// 🔥 PROXY
// =======================
app.get("/api/upload/:file/:token", async (req, res) => {
  try {
    const { file, token } = req.params;

    const { data } = await getProxyMap();

    if (!data[file] || data[file].token !== token) {
      return res.status(404).send("Not found");
    }

    const realUrl = data[file].url;

    const response = await axios.get(realUrl, {
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
        `attachment`
      );
    }

    response.data.pipe(res);

  } catch (err) {
    res.status(500).send("Error");
  }
});

// =======================
module.exports = app;
