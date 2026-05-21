describe("cron secret middleware", () => {
  function loadMiddleware(cronSecret = "secret") {
    jest.resetModules();
    jest.doMock("../config/env", () => ({ cronSecret }));
    return require("../middlewares/cronAuth").requireCronSecret;
  }

  test("rejects missing cron secret header", () => {
    const requireCronSecret = loadMiddleware("secret");
    const next = jest.fn();

    requireCronSecret({ headers: {} }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test("accepts matching cron secret header", () => {
    const requireCronSecret = loadMiddleware("secret");
    const next = jest.fn();

    requireCronSecret({ headers: { "x-cron-secret": "secret" } }, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  test("fails safely when CRON_SECRET is not configured", () => {
    const requireCronSecret = loadMiddleware("");
    const next = jest.fn();

    requireCronSecret({ headers: { "x-cron-secret": "secret" } }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });
});
