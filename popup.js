document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('check-btn');
  const resultsEl = document.getElementById('results');

  btn.addEventListener('click', async () => {
    clearResults();
    setStatus('trying to find the product title and price...');

    try {
      const productInfo = await getProductInfoFromActiveTab();
      if (!productInfo.title) {
        setStatus('could not find the title... are you on etsy, amazon or ebay?');
        return;
      }

      setStatus('Querying dropship API...');
      const apiHost = 'https://j4cswgw8gwk8wcs4o4ww0oks.fonz.pt';
      const apiUrl = `${apiHost}/search/?q=${encodeURIComponent(productInfo.title)}`;

      const resp = await fetch(apiUrl, { headers: { Accept: 'application/json, text/plain, */*' } });
      if (!resp.ok) {
        const maybeText = await resp.text().catch(() => null);
        throw new Error(`API returned ${resp.status} from ${apiHost}${maybeText ? `: ${maybeText}` : ''}`);
      }

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      let data;
      if (contentType.includes('application/json')) {
        try {
          data = await resp.json();
        } catch (e) {
          const raw = await resp.text().catch(() => null);
          setStatus(raw ? `api returned invalid json: ${raw}` : `api returned invalid json: ${e.message}`);
          return;
        }
      } else {
        const text = await resp.text().catch(() => null);
        setStatus(text || 'api returned non-json response');
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        setStatus('no results found');
        return;
      }

      setStatus('Results:');
      renderResults(data, productInfo.price);
    } catch (err) {
      console.error(err);
      setStatus('error: ' + (err.message || err));
    }
  });

  function clearResults() {
    resultsEl.innerHTML = '';
  }

  function setStatus(text) {
    clearResults();
    const p = document.createElement('p');
    p.textContent = text;
    resultsEl.appendChild(p);
  }

  async function getProductInfoFromActiveTab() {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0) return resolve({ title: '', price: null });
          const tab = tabs[0];

          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              func: () => {
                try {
                  const host = (location && location.hostname) ? location.hostname.toLowerCase() : '';
                  let title = '';
                  let price = null;

                  if (host.includes('amazon.')) {
                    const amazonSel = document.getElementById('productTitle') || document.querySelector('#title span#productTitle') || document.getElementById('ebooksProductTitle') || document.querySelector('#title');
                    if (amazonSel) {
                      const txt = (amazonSel.innerText || amazonSel.textContent || '').trim();
                      if (txt) title = txt;
                    }
                    
                    // Extract Amazon price
                    const priceSelectors = [
                      '.a-price .a-offscreen',
                      '#priceblock_ourprice',
                      '#priceblock_dealprice',
                      '.a-price-whole',
                      '#price_inside_buybox',
                      '.a-color-price'
                    ];
                    for (const sel of priceSelectors) {
                      const priceEl = document.querySelector(sel);
                      if (priceEl) {
                        const priceText = (priceEl.innerText || priceEl.textContent || '').trim();
                        const match = priceText.match(/[\$\£\€]?\s*(\d+[,\.]?\d*\.?\d*)/);                        if (match) {
                          price = parseFloat(match[1].replace(/,/g, ''));
                          if (!isNaN(price)) break;
                        }
                      }
                    }
                  }

                  if (host.includes('ebay.')) {
                    const ebaySel = document.querySelector('#itemTitle') || document.querySelector('h1[itemprop="name"]') || document.querySelector('.it-ttl') || document.querySelector('h1');
                    if (ebaySel) {
                      let txt = (ebaySel.innerText || ebaySel.textContent || '').trim();
                      txt = txt.replace(/^Details\s+about\s*/i, '').trim();
                      if (txt) title = txt;
                    }
                    
                    // Extract eBay price
                    const priceSelectors = [
                      '.x-price-primary .ux-textspans',
                      '[itemprop="price"]',
                      '.display-price',
                      '#prcIsum',
                      '#mm-saleDscPrc'
                    ];
                    for (const sel of priceSelectors) {
                      const priceEl = document.querySelector(sel);
                      if (priceEl) {
                        const priceText = (priceEl.innerText || priceEl.textContent || priceEl.getAttribute('content') || '').trim();
                        const match = priceText.match(/[\$\£\€]?\s*(\d+[,\.]?\d*\.?\d*)/);                        if (match) {
                          price = parseFloat(match[1].replace(/,/g, ''));
                          if (!isNaN(price)) break;
                        }
                      }
                    }
                  }

                  if (host.includes('etsy.')) {
                    // Extract Etsy price
                    const priceSelectors = [
                      '[data-buy-box-region="price"]',
                      '.wt-text-title-03',
                      'p[class*="price"]'
                    ];
                    for (const sel of priceSelectors) {
                      const priceEl = document.querySelector(sel);
                      if (priceEl) {
                        const priceText = (priceEl.innerText || priceEl.textContent || '').trim();
                        const match = priceText.match(/[\$\£\€]?\s*(\d+[,\.]?\d*\.?\d*)/);                        if (match) {
                          price = parseFloat(match[1].replace(/,/g, ''));
                          if (!isNaN(price)) break;
                        }
                      }
                    }
                  }

                  // If no title found yet, try generic selectors
                  if (!title) {
                    const og = document.querySelector('meta[property="og:title"]') || document.querySelector('meta[name="og:title"]');
                    if (og && og.content) title = og.content.trim();

                    if (!title) {
                      const h1 = document.querySelector('h1');
                      if (h1 && h1.innerText) title = h1.innerText.trim();
                    }

                    if (!title) {
                      const titleSelectors = ['[data-test-listing-title]', '.product-title', '.title', '.listing-title', '.wt-text-body-03'];
                      for (const s of titleSelectors) {
                        const el = document.querySelector(s);
                        if (el && (el.innerText || el.textContent)) {
                          title = (el.innerText || el.textContent).trim();
                          break;
                        }
                      }
                    }

                    if (!title && document.title) title = document.title.trim();
                  }

                  return { title, price };
                } catch (e) {
                }
                return { title: '', price: null };
              }
            },
            (injectionResults) => {
              try {
                if (chrome.runtime.lastError) {
                  console.warn('scripting error', chrome.runtime.lastError.message);
                  return resolve({ title: '', price: null });
                }
                const r = injectionResults && injectionResults[0] && injectionResults[0].result;
                resolve(r || { title: '', price: null });
              } catch (e) {
                resolve({ title: '', price: null });
              }
            }
          );
        });
      } catch (e) {
        resolve({ title: '', price: null });
      }
    });
  }

  function renderResults(items, originalPrice) {
    clearResults();

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';

      const img = document.createElement('img');
      let src = item.image || '';
      if (src.startsWith('//')) src = 'https:' + src;
      if (!src.startsWith('http')) src = 'https:' + src;
      img.src = src;
      img.alt = item.title || '';
      img.className = 'thumb';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.title || '';

      const btn = document.createElement('button');
      btn.textContent = 'see on aliexpress';
      btn.addEventListener('click', () => {
        let u = item.url || '';
        if (u.startsWith('//')) u = 'https:' + u;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
        chrome.tabs.create({ url: u });
      });

      const priceContainer = document.createElement('div');
      priceContainer.className = 'price';
      
      if (typeof item.price !== 'undefined') {
        const aliPrice = document.createElement('div');
        aliPrice.textContent = `AliExpress: $${item.price}`;
        priceContainer.appendChild(aliPrice);
        
        if (originalPrice && originalPrice > 0) {
          const origPrice = document.createElement('div');
          origPrice.textContent = `Original: $${originalPrice.toFixed(2)}`;
          origPrice.style.fontSize = '0.9em';
          origPrice.style.color = '#666';
          priceContainer.appendChild(origPrice);
          
          const savings = originalPrice - item.price;
          if (savings > 0) {
            const savingsEl = document.createElement('div');
            savingsEl.textContent = `Save: $${savings.toFixed(2)} (${((savings / originalPrice) * 100).toFixed(0)}%)`;
            savingsEl.style.fontSize = '0.9em';
            savingsEl.style.color = '#22c55e';
            savingsEl.style.fontWeight = 'bold';
            priceContainer.appendChild(savingsEl);
          } else if (savings < 0) {
            const moreExpensive = document.createElement('div');
            moreExpensive.textContent = `$${Math.abs(savings).toFixed(2)} more expensive`;
            moreExpensive.style.fontSize = '0.9em';
            moreExpensive.style.color = '#ef4444';
            priceContainer.appendChild(moreExpensive);
          }
        }
      }

      card.appendChild(img);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.appendChild(title);
      meta.appendChild(priceContainer);
      meta.appendChild(btn);
      card.appendChild(meta);

      resultsEl.appendChild(card);
    });
  }
});
