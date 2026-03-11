module.exports = async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      okxConfigured: Boolean(
        process.env.OKX_DEX_API_KEY &&
          process.env.OKX_DEX_SECRET_KEY &&
          process.env.OKX_DEX_PASSPHRASE
      ),
      providerMode:
        process.env.OKX_DEX_API_KEY &&
        process.env.OKX_DEX_SECRET_KEY &&
        process.env.OKX_DEX_PASSPHRASE
          ? "okx-preferred"
          : "fallback-only"
    })
  );
};
