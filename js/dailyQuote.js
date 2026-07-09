(() => {
  const quoteBanner = document.querySelector("[data-daily-quote]");
  if (!quoteBanner) return;

  const quotes = [
    {
      text: "The map is not the territory.",
      author: "Alfred Korzybski",
    },
    {
      text: "Everything is related to everything else, but near things are more related than distant things.",
      author: "Waldo Tobler",
    },
    {
      text: "Without geography, you're nowhere.",
      author: "Jimmy Buffett",
    },
    {
      text: "Good maps turn messy places into clear decisions.",
      author: "TrueGIS",
    },
    {
      text: "A clean map is a quiet kind of power.",
      author: "TrueGIS",
    },
    {
      text: "The best GIS tools remove friction before users notice it.",
      author: "TrueGIS",
    },
    {
      text: "Every feature tells a story. The map decides how clearly it is heard.",
      author: "TrueGIS",
    },
    {
      text: "Simple tools win when they make complex work feel obvious.",
      author: "TrueGIS",
    },
    {
      text: "A useful map does not just show where. It helps explain why.",
      author: "TrueGIS",
    },
    {
      text: "Better spatial data starts with better spatial habits.",
      author: "TrueGIS",
    },
    {
      text: "A map should invite action, not confusion.",
      author: "TrueGIS",
    },
    {
      text: "The strongest tools are the ones people can understand immediately.",
      author: "TrueGIS",
    },
  ];

  const getTodayKey = () => {
    const now = new Date();
    return [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
    ].join("-");
  };

  const getDailyQuote = () => {
    const now = new Date();
    const dayNumber = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000
    );

    return quotes[dayNumber % quotes.length];
  };

  const todayKey = getTodayKey();
  const dismissedStorageKey = `truegis:dailyQuoteDismissed:${todayKey}`;

  try {
    if (localStorage.getItem(dismissedStorageKey) === "true") return;
  } catch (_err) {
    // Ignore storage restrictions. The quote can still show normally.
  }

  const quote = getDailyQuote();
  const textEl = quoteBanner.querySelector("[data-quote-text]");
  const authorEl = quoteBanner.querySelector("[data-quote-author]");
  const dismissBtn = quoteBanner.querySelector("[data-quote-dismiss]");

  if (textEl) textEl.textContent = `“${quote.text}”`;
  if (authorEl) authorEl.textContent = ` — ${quote.author}`;

  dismissBtn?.addEventListener("click", () => {
    quoteBanner.hidden = true;

    try {
      localStorage.setItem(dismissedStorageKey, "true");
    } catch (_err) {
      // Ignore storage restrictions.
    }
  });

  quoteBanner.hidden = false;
})();
