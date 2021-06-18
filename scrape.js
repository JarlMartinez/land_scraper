const https = require('https');
const { JSDOM } = require('jsdom');

// TODO dont require jsdom.


/**    Main variables    */
const MIN_CID = 0;
const MAX_CID = 120; // Has been unsuccessfull after ~180.
const OWNER_NAME_FRARMENT = 'pfirman';


/**    Process values    */
const HOST = 'propaccess.trueautomation.com';
let SESSION_ID;
let ALL_PROPERTIES = [];
const PROPERTIES_BY_CID = {};
const scrapes_failed = [];
const successfull_retries = [];
const scrapes_skipped = [];


/**    Main Function    */
(async function() {

  /**   Scrape loop   */
  for(let cid = MIN_CID; cid < MAX_CID; cid++) {

    try {
      await scrapeCid(cid);
      console.log(`CID scraped: ${cid}\nProperties accumulated: ${ALL_PROPERTIES.length}\n`);
    } catch (e) {
      scrapes_failed.push(cid);
      console.log(`ERROR - CID ${cid}\n${e}\nRetrying...\n`);
      /**   Second try   */
      try {
        await scrapeCid(cid);
        successfull_retries.push(cid);
        console.log(`CID scraped: ${cid}\nProperties accumulated: ${ALL_PROPERTIES.length}\n`);
      } catch (e) {
        scrapes_skipped.push(cid);
        console.log(`2nd ERROR on CID ${cid}\n${e}...Skipping CID ${cid}...\n`);
      }
    } finally {
        /**    Dont soak server - avoid getting banned.    */
        await sleep(0);
    }
  }

  /**   Process End   */
  console.log(PROPERTIES_BY_CID, '\n');
  console.log('CIDs skipped', scrapes_skipped, '\n');
})();

function sleep(s) {
  return new Promise(res => {
    setTimeout(() => res(), s);
  });
}

/**

  Per CID:
    1. Ping server -> get session-token -> set as header cookie.
    2. POST desired data as form-data (https://propaccess.trueautomation.com/clientdb/propertysearch.aspx?cid=50).
    3. GET html data.
    4. Extract houses' ids from DOM.
    5. Print status (by default, read TODO below).
  END LOOP.

  END Process.
    default: print data.
    TODO either of create json file / print, or both.

*/

/**

  Functions.

*/
async function scrapeCid(cid) {
  try {
    await setNewSessionId(cid);
    await postSearch(cid);
    const html = await getSearch(cid);
    const cid_properties = getPropertiesIds(html);
    ALL_PROPERTIES = [...ALL_PROPERTIES, ...cid_properties];
    if (cid_properties.length > 0) {
      PROPERTIES_BY_CID[cid] = [...cid_properties] 
    }
  } catch (e) {
    throw e;
  }
}

function getPropertiesIds(html) {
  const dom = new JSDOM(html);
  const occurrencies = [...dom.window.document.querySelectorAll('td > a')];
  let ids = occurrencies.reduce((all, o) => {
    if (o.textContent === 'View Details') {
      return [...all, o.href.split('=')[2]];
    } else {
      return all;
    }
  }, []);
  const properties_ids = [];
  ids.forEach(i => {
    if (!properties_ids[i]) {
      properties_ids.push(i);
    }
  });
  return properties_ids;
}

function getSearch(cid) {
  return new Promise((resolve, reject) => {
    const path = '/clientdb/SearchResults.aspx?cid=' + cid;
    const options = {
      host: HOST,
      path,
      method: 'GET',
      headers: {
        'Cookie': 'ASP.NET_SessionId=' + SESSION_ID + ';'
      },
    };
    const req = https.request(options, res => {
      let html = '';
      if (res.statusCode === 200) {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          html += chunk;
        })
        res.on('end', () => {
          resolve(html);
        });
      } else {
        reject(`[ getSearch() error ] successfull request though not 200\n`);
      }
    });

    req.on('error', e => reject(`[ getSearch() error ] ${e.message}`));
    req.end();
  });
}

function postSearch(cid) {
  return new Promise((resolve, reject) => {
    const path = '/clientdb/propertysearch.aspx?cid=' + cid;
    const options = {
      host: HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': 'ASP.NET_SessionId=' + SESSION_ID + ';'
      },
    };
    const req = https.request(options, res => {
        if (res.statusCode === 302) {
          resolve();
        } else {
          reject(`[ postSearch() error ] successfull request though not 302\n`);
        }
    });
    
    req.on('error', e => reject(`[ postSearch() error ] ${e.message}`));

    const data = `__EVENTTARGET=&__EVENTARGUMENT=&__VIEWSTATE=%2FwEPDwULLTEyMjcyNTA4MjUPZBYCZg9kFgICAw9kFg4CBw9kFgICAQ8PFgIeBFRleHQFQEVudGVyIG9uZSBvciBtb3JlIHNlYXJjaCBpdGVtcy4gIENsaWNrICJCYXNpYyIgZm9yIGxlc3Mgb3B0aW9ucy5kZAIJDxYCHgdWaXNpYmxlaGQCCw8WAh8BaGQCDQ9kFggCAQ8PZBYCHgVzdHlsZQUOZGlzcGxheTpibG9jazsWAgIBDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAgIPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrOxYCAgMPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrO2QCAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7FgICAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAIEDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAg8PFgIfAgUOZGlzcGxheTpibG9jaztkAhEPZBYCAgIPZBYIZg8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAIBDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAgIPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrO2QCAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAITDxYCHwFnZGTfS5vsIa7kZj0vBEFSJ0mCSu%2BXvA%3D%3D&__VIEWSTATEGENERATOR=90EF699E&__EVENTVALIDATION=%2FwEWLgKD2%2BqBCAKAuK2zAwKG5ZDeAgLRjKCYCwLL6tOoCwKtl6K5CQLj75mjBALH5cidBwLA6r%2BYCQLlkpHJDQKpzZHiDgLk66LTAQLBvPaTBAK%2Bjrf3AgLBn%2B7PAwLBn5KrDALciOyDDwLciJDvBwLciMSHBQLciOjgDQLciJzMBgLciICpDwLciLSSCALciNh%2FAtyIzNgJAtyI8IUCArexwpwFArex9vkNArex2pALAqqo3%2B0LAoiIu%2BgNArSIo%2FYNArSI2%2FYNAqeIu%2BgNArmIu%2BgNAsfUp80PAoWwoaQGAqzGsccDAsLcudwFAv2CkoQCAviCroQCAvqCkoQCAtrDydMFAtvDvdAFAq6A6e4IAsSm9%2FwMwR9waWVV9q3cLD%2FzQYBdJt6BtEM%3D&propertySearchOptions%3AownerName=${OWNER_NAME_FRARMENT}&propertySearchOptions%3AstreetNumber=&propertySearchOptions%3AstreetName=&propertySearchOptions%3Apropertyid=&propertySearchOptions%3Ageoid=&propertySearchOptions%3Adba=&propertySearchOptions%3Aabstract=&propertySearchOptions%3Asubdivision=&propertySearchOptions%3AmobileHome=&propertySearchOptions%3Acondo=&propertySearchOptions%3AagentCode=&propertySearchOptions%3Ataxyear=2021&propertySearchOptions%3ApropertyType=All&propertySearchOptions%3AorderResultsBy=Owner+Name&propertySearchOptions%3ArecordsPerPage=250&propertySearchOptions%3AsearchAdv=Search`;
    req.write(data);
    req.end();

  })
}

function setNewSessionId(cid) {
  return new Promise((resolve, reject) => {

    const path = '/clientdb/propertysearch.aspx?cid=' + cid;
    const req = https.request(
      { host: HOST, path, method: 'GET' },
      res => {
        if (res.statusCode === 200) {
          const cookie = JSON.stringify(res.headers["set-cookie"][0]);
          SESSION_ID = cookie.split(';')[0].split('=')[1];
          resolve();
        } else {
          reject(`[setNewSession()] successfull request though not 200\n`);
        }
    });
    
    req.on('error', (e) => {
      reject(`[setNewSession() error] ${e.message}`);
    });
    
    req.end();
  })
}
