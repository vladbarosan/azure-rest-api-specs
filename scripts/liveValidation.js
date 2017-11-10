// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

'use strict';

const utils = require('../test/util/utils'),
  request = require('request-promise-native');

let repoUrl = "https://github.com/vladbarosan/azure-rest-api-specs"; //utils.getRepoUrl();
let branch = utils.getSourceBranch();
let duration = 30;
let processingDelay = 10;
let isRunningInTraviCI = process.env.MODE === 'LiveValidation' && process.env.PR_ONLY === 'true';
let specsPaths = utils.getFilesChangedInPR();
let regex = /resource-manager\\(.*)\\(.*)\\.*/;
let successThreshold = 90;
let testPath = 'c:\\vladdb\\devdiv\\repos\\azure\\azure-rest-api-specs\\specification\\redis\\resource-manager\\Microsoft.Cache\\2017-02-01\\redis.json';

let validationModels = new Map();
console.log(`size of map: ${validationModels.size}`)
for (const specPath of specsPaths )
{
  let matchResult =specPath.match(regex); //replace with spec
  let resourceProvider = matchResult[1];
  let apiVersion = matchResult[2];

  if (!validationModels.has(resourceProvider))
  {
    validationModels.set(resourceProvider, new Set());
  }

  validationModels.get(resourceProvider).add(apiVersion);
}

console.log(`size of map:${validationModels.size}`);

async function runScript() {
  // See whether script is in Travis CI context
  console.log(`isRunningInTraviCI: ${isRunningInTraviCI}`);

  let validationService = "http://vladdb-oav-docker.azurewebsites.net/validations";

  let resourceProvider = validationModels.keys().next().value;
  console.log(`RP is: ${resourceProvider}`);

  let apiVersion = validationModels.get(resourceProvider).values().next().value;
  console.log(`ApiVersion is: ${apiversion}`);

  let validationId  =JSON.parse(await request.post(validationService).form({
    repoUrl: repoUrl,
    branch: branch,
    resourceProvider: resourceProvider,
    apiVersion: apiVersion,
    duration: duration
  })).validationId;

  await timeout((duration+processingDelay)*1000);
  let validationResultUrl = `${validationService}/${validationId}`;
  let operationResults = JSON.parse(await request(validationResultUrl));

  let totalResults = operationResults.find( result => result.RowKey === "total");
  delete totalResults["PartitionKey"];
  console.log(`Displaying results of validation session: ${validationId}`);

  console.log(JSON.stringify(totalResults));

  let failingOperations = [];

  for (const operationResult of operationResults) {
        if(operationResult.RowKey !== "total"){
          delete operationResult["PartitionKey"];
          console.log(`${JSON.stringify(operationResult)}`);
        }

        if(operationResult.SuccessRate < successThreshold) {
          failingOperations.push(operationResult.RowKey);
        }
  }

  if(failingOperations.length > 0) {
    console.log(`The changes in the specs introduced by this PR potentially do not reflect the Service API.`);
    console.log(`The following operations have a success rate lower than ${successThreshold} percent:${JSON.stringify(failingOperations)}`);
    console.log(`Success rate required to move forward is > ${successThreshold} percent FOR EACH OPERATION. Please review before moving forward. Thanks!`);
    process.exitCode = 1;
  } else {
    console.log(`Success rate is ${totalResults.SuccessRate} > ${successThreshold}. You can move forward.`);
  }
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runScript().then(success => {
  console.log(`Thanks for using the live validation tool.`);
  console.log(`If you encounter any issue(s), please open issue(s) at https://github.com/Azure/oav-express/issues .`);
}).catch(err => {
  console.log(err);
  process.exitCode = 1;
});

