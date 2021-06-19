First off, ensure NodeJS is available in the box. [NodeJS Installers](https://nodejs.org/en/download/).

For the 1st time, do:
````
git clone https://github.com/JarlMartinez/land_scraper.git
cd land_scraper
npm i
````

---

**Scrape lands data:**

Available parameters for serch:
  * Owner
  * Tax year
  * CIDs range

1. Set desired search at *./index.js* -> *Main Variables*
2. Run it: `node . > /output/file/location/new-data.json`
(average wait time: 2s/cid)

Currently, the script logs to the console the final data as json format.
Pipe it into a file to save it.

Suggested file name pattern: ownerName_taxYear_minCid-maxCid.json
