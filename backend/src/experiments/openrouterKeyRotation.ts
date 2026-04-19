// const OPENROUTER_KEYS = [
//   "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",
//   "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",
//   "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",
//   "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",
//   "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",
//   "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"
// ];

// // Track remaining credits and last usage timestamp
// let keyStatus = OPENROUTER_KEYS.map(key => ({
//   key,
//   remaining: 11000, // initial token credit per key (update as needed)
//   lastUsed: null // timestamp of last exhaustion
// }));

// function getNextKey(requiredTokens) {
//   const now = Date.now();

//   for (let status of keyStatus) {
//     // If key exhausted, check if 24h passed
//     if (status.remaining < requiredTokens) {
//       if (status.lastUsed && now - status.lastUsed >= 24 * 60 * 60 * 1000) {
//         // Reset key after 24h
//         status.remaining = 11000;
//         status.lastUsed = null;
//       }
//     }

//     if (status.remaining >= requiredTokens) {
//       return status;
//     }
//   }

//   return null;
// }

// async function safeChatCompletion(prompt, maxTokens, temperature = 0.7) {
//   let remainingTokens = maxTokens;
//   let finalContent = "";

//   while (remainingTokens > 0) {
//     const keyObj = getNextKey(remainingTokens);
//     if (!keyObj) {
//       throw new Error("All keys exhausted or insufficient credits for remaining tokens.");
//     }

//     const tokensToRequest = Math.min(remainingTokens, keyObj.remaining);

//     try {
//       const client = getOpenRouterClient(keyObj.key);

//       const response = await client.chat.completions.create(
//         {
//           model: OPENROUTER_MODEL,
//           max_tokens: tokensToRequest,
//           temperature,
//           top_p: 1,
//           response_format: { type: "json_object" },
//           messages: [
//             {
//               role: "system",
//               content: "You are a strict JSON generator. Return valid JSON only, with no markdown fences or extra text.",
//             },
//             { role: "user", content: prompt },
//           ],
//         },
//         {
//           headers: {
//             "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost:3001",
//             "X-Title": process.env.OPENROUTER_APP_NAME || "Tailored Resume Builder",
//           },
//         }
//       );

//       const content = response.choices[0]?.message?.content;
//       if (!content) throw new Error("Unexpected response from OpenRouter");

//       finalContent += content;
//       remainingTokens -= tokensToRequest;
//       keyObj.remaining -= tokensToRequest;

//       console.log(`Used key ${keyObj.key.slice(0, 12)}… for ${tokensToRequest} tokens. Remaining: ${remainingTokens}`);

//       // Mark key as exhausted if it ran out
//       if (keyObj.remaining <= 0) keyObj.lastUsed = Date.now();

//     } catch (err) {
//       if (err.message.includes("requires more credits")) {
//         console.warn(`Key ${keyObj.key.slice(0, 12)}… insufficient credits. Skipping.`);
//         keyObj.remaining = 0;
//         keyObj.lastUsed = Date.now();
//       } else {
//         throw err;
//       }
//     }
//   }

//   return finalContent;
// }