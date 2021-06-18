const https = require('https');
const { JSDOM } = require('jsdom');

// TODO
//    extract from DOM the last db update date.
//    -op --open <cid_website>
//    -v --verbose
//    -o --output </new/file/data.json
//    -h --help


/**    Main variables    */
const OWNER_NAME_FRARMENT = 'pfirman';
const TAX_YEAR = 2020;
const MIN_CID = 0;
const MAX_CID = 115; // Has been unsuccessful after ~110.

const CIDS = [];
// Could specify certain CIDs above, comment out loop below if so.
for(let cid = MIN_CID; cid <= MAX_CID; cid++) {
  CIDS.push(cid);
}


/**    Process values    */
const HOST = 'propaccess.trueautomation.com';
let SESSION_ID;
const FILE_OUT = {
  _date: new Date(),
  search: {
    cids_range: `${MIN_CID}-${MAX_CID}`,
    owner: OWNER_NAME_FRARMENT,
    tax_year: TAX_YEAR,
  },
  cid_not_scrapped_due_double_failure: [],
  total_lands_found: 0,
  data: [],
};
Object.preventExtensions(FILE_OUT);


/*
    Per CID:
      1. Ping server -> get session-token -> set as header cookie.
      2. POST desired data as form-data (https://propaccess.trueautomation.com/clientdb/propertysearch.aspx?cid=50).
      3. GET html data.
      4. Extract houses' ids from DOM.
      5. Print status (by default, read TODO below).
    END LOOP.

    END Process.
      default: print out data as JSON.
      TODO custom output.
*/
(async function() {

  for(cid of CIDS) {
    try {
      await scrapeCid(cid);

    } catch (e) {
      /**   Second try   */
      try {
        await scrapeCid(cid);
      } catch (e) {
        FILE_OUT.cid_not_scrapped_due_double_failure.push(cid);
      }
      
    } finally {
        /**    Dont soak server - avoid getting banned.    */
        await sleep(1000);
    }
  }
  
  /**   Process Ends   */
  if (FILE_OUT.cid_not_scrapped_due_double_failure.length > 0) {
    await allFailedLastShot();
  }
  console.log( JSON.stringify(FILE_OUT, null, '\t') ); // Format by tabs.
})();


/**

  Functions.

*/
function allFailedLastShot() {
  console.log('Beggining allFailedLastShot()');
  const { cid_not_scrapped_due_double_failure: cids_retry } = FILE_OUT;
  return new Promise (async (resolve, reject) => {
    for(cid of cids_retry) {
      try {
        await scrapeCid(cid);
        FILE_OUT.cid_not_scrapped_due_double_failure.splice( cids_retry.indexOf(cid), 1);
      } catch (e) {
        //
      }
    }
    resolve();
  })
}

async function scrapeCid(cid) {
  try {
    await setNewSessionId(cid);
    await postSearch(cid);
    const html = await getSearch(cid);
    const cid_properties_ids = getPropertiesIds(html);

    if (cid_properties_ids.length > 0) {
      /**    Data    */
      FILE_OUT.total_lands_found += cid_properties_ids.length;
      FILE_OUT.data = [
        ...FILE_OUT.data,
        {
          cid: cid,
          total_lands: cid_properties_ids.length,
          lands: cid_properties_ids.map(id => ({
              id,
              website: `https://${HOST}/clientdb/Property.aspx?cid=${cid}&prop_id=${id}`
          })),
        },
      ];
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

    const data = `__EVENTTARGET=&__EVENTARGUMENT=&__VIEWSTATE=%2FwEPDwULLTEyMjcyNTA4MjUPZBYCZg9kFgICAw9kFg4CBw9kFgICAQ8PFgIeBFRleHQFQEVudGVyIG9uZSBvciBtb3JlIHNlYXJjaCBpdGVtcy4gIENsaWNrICJCYXNpYyIgZm9yIGxlc3Mgb3B0aW9ucy5kZAIJDxYCHgdWaXNpYmxlaGQCCw8WAh8BaGQCDQ9kFggCAQ8PZBYCHgVzdHlsZQUOZGlzcGxheTpibG9jazsWAgIBDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAgIPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrOxYCAgMPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrO2QCAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7FgICAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAIEDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAg8PFgIfAgUOZGlzcGxheTpibG9jaztkAhEPZBYCAgIPZBYIZg8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAIBDw9kFgIfAgUOZGlzcGxheTpibG9jaztkAgIPD2QWAh8CBQ5kaXNwbGF5OmJsb2NrO2QCAw8PZBYCHwIFDmRpc3BsYXk6YmxvY2s7ZAITDxYCHwFnZGTfS5vsIa7kZj0vBEFSJ0mCSu%2BXvA%3D%3D&__VIEWSTATEGENERATOR=90EF699E&__EVENTVALIDATION=%2FwEWLgKD2%2BqBCAKAuK2zAwKG5ZDeAgLRjKCYCwLL6tOoCwKtl6K5CQLj75mjBALH5cidBwLA6r%2BYCQLlkpHJDQKpzZHiDgLk66LTAQLBvPaTBAK%2Bjrf3AgLBn%2B7PAwLBn5KrDALciOyDDwLciJDvBwLciMSHBQLciOjgDQLciJzMBgLciICpDwLciLSSCALciNh%2FAtyIzNgJAtyI8IUCArexwpwFArex9vkNArex2pALAqqo3%2B0LAoiIu%2BgNArSIo%2FYNArSI2%2FYNAqeIu%2BgNArmIu%2BgNAsfUp80PAoWwoaQGAqzGsccDAsLcudwFAv2CkoQCAviCroQCAvqCkoQCAtrDydMFAtvDvdAFAq6A6e4IAsSm9%2FwMwR9waWVV9q3cLD%2FzQYBdJt6BtEM%3D&propertySearchOptions%3AownerName=${OWNER_NAME_FRARMENT}&propertySearchOptions%3AstreetNumber=&propertySearchOptions%3AstreetName=&propertySearchOptions%3Apropertyid=&propertySearchOptions%3Ageoid=&propertySearchOptions%3Adba=&propertySearchOptions%3Aabstract=&propertySearchOptions%3Asubdivision=&propertySearchOptions%3AmobileHome=&propertySearchOptions%3Acondo=&propertySearchOptions%3AagentCode=&propertySearchOptions%3Ataxyear=${TAX_YEAR}&propertySearchOptions%3ApropertyType=All&propertySearchOptions%3AorderResultsBy=Owner+Name&propertySearchOptions%3ArecordsPerPage=250&propertySearchOptions%3AsearchAdv=Search`;
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

function sleep(s) {
  return new Promise(res => {
    setTimeout(() => res(), s);
  });
}