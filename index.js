'use strict';

const url = require('url');
const https = require('https');
const util = require('util');
const aws = require('aws-sdk');
const codecommit = new aws.CodeCommit({apiVersion: '2015-04-13'});

exports.postBuildDetailsComment = function (event, context) {

    // TODO - Replace this UUID from console
    const UUID = "eyJlbmNyeXB0ZWREYXRhIjoidXJMRUZRU1pUZjB4NXRLa1BxZUJOYlYzOHA2aDExd3VxWGtkc2ZhdFdzZjF1OEdnR1JDKzAyU1ZVUWFUSmNoRmovbWpZenB5M2hwT1RvV0Erc3lHNzlFPSIsIml2UGFyYW1ldGVyU3BlYyI6Ill1N0tPUC9XMEdxQmZ3TWUiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0=";

    const REGION = event["region"],

        EVENT_DETAIL = event["detail"],
        ADDITIONAL_INFO = EVENT_DETAIL["additional-information"],

        ENV_VARS = ADDITIONAL_INFO["environment"]["environment-variables"],
        EXPORTED_ENV_VARS = ADDITIONAL_INFO["exported-environment-variables"],
        LOGS_LINK = ADDITIONAL_INFO["logs"]["deep-link"],
        SLACK_BUILD_TIME = ADDITIONAL_INFO["build-start-time"],
        PHASES = ADDITIONAL_INFO["phases"];

    console.log(JSON.stringify(event));

    const PARAMS = {
        afterCommitId: null,
        beforeCommitId: null,
        content: null,
        pullRequestId: null,
        repositoryName: null
    };

    const POST_OPTIONS = {
        hostname: 'hooks.slack.com',
        path: 'https://hooks.slack.com/services/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',
        method: 'POST',
      };

    // Extract information from environment variables
    for (const ENV_VAR of ENV_VARS) {
        const KEY = ENV_VAR["name"], VALUE = ENV_VAR["value"];

        if (KEY === "pullRequestId") {
            PARAMS.pullRequestId = VALUE;
        } else if (KEY === "repositoryName") {
            PARAMS.repositoryName = VALUE;
        } else if (KEY === "sourceCommit") {
            PARAMS.beforeCommitId = VALUE;
        } else if (KEY === "destinationCommit") {
            PARAMS.afterCommitId = VALUE;
        }
    }

    let total_tests, successful_tests, failed_tests,
        total_lines, covered_lines, uncovered_lines, coverage_percentage;

    // Extract information from exported environment variables
    for (const EXPORTED_ENV_VAR of EXPORTED_ENV_VARS) {
        const KEY = EXPORTED_ENV_VAR["name"], VALUE = EXPORTED_ENV_VAR["value"];

        if (KEY === "TESTS_TOTAL") {
            total_tests = VALUE;
        } else if (KEY === "TESTS_SUCCESS") {
            successful_tests = VALUE;
        } else if (KEY === "TESTS_FAIL") {
            failed_tests = VALUE;
        } else if (KEY === "COVERAGE_LINES_TOTAL") {
            total_lines = VALUE;
        } else if (KEY === "COVERAGE_LINES_SUCCESS") {
            covered_lines = VALUE;
        } else if (KEY === "COVERAGE_LINES_FAIL") {
            uncovered_lines = VALUE;
        } else if (KEY === "COVERAGE_LINES_PCT") {
            coverage_percentage = VALUE;
        }
    }

    let build_summary, test_summary, coverage_summary;

    test_summary = `#### Test summary\nTests executed: **${total_tests}**\n\nTests passed: **${successful_tests}**\n\nTests failed: **${failed_tests}**`;
    coverage_summary = `#### Coverage summary\nAssessed lines: **${total_lines}**\n\nCovered lines: **${covered_lines}**\n\nUncovered lines: **${uncovered_lines}**\n\nThe code coverage for this build is **${coverage_percentage}%**`;

    codecommit.getPullRequest({
        pullRequestId: PARAMS.pullRequestId
    }, function (error, response) {
        if (error) {
            console.log(error, error.stack);
        } else {
            const REVISION_ID = response["pullRequest"]["revisionId"];
            const PULL_REQUEST_TARGETS = response["pullRequest"]["pullRequestTargets"];
            let branch_name;

            for (const PULL_REQUEST_TARGET of PULL_REQUEST_TARGETS) {
                branch_name = PULL_REQUEST_TARGET["sourceReference"];
            }

            branch_name = branch_name.replace("refs/heads/", "");

            for (const PHASE of PHASES) {
                const PHASE_STATUS = PHASE["phase-status"];

                // Build status
                if (PHASE_STATUS === "FAILED") {
                    build_summary = `#### Build status\n![Failing](https://s3.amazonaws.com/codefactory-us-east-1-prod-default-build-badges/failing.svg "Failing") - See the [Logs](${LOGS_LINK})`;
                    break;
                } else {
                    build_summary = `#### Build status\n![Passing](https://s3.amazonaws.com/codefactory-us-east-1-prod-default-build-badges/passing.svg "Passing") - See the [Logs](${LOGS_LINK})`;
                }
            }

            PARAMS.content = `${build_summary}\n${test_summary}\n${coverage_summary}`;

            console.log(JSON.stringify(PARAMS));

            const PR_URL = `https://console.aws.amazon.com/codesuite/codecommit/repositories/${PARAMS.repositoryName}/pull-requests/${PARAMS.pullRequestId}/details?region=${REGION}`

            const message = {
                	"blocks": [
                		{
                			"type": "section",
                			"text": {
                				"type": "mrkdwn",
                				"text": " :pushpin: Hi <@U010T5E3UAD> You have a :new: pull request :\n"
                			}
                		},
                		{
                			"type": "section",
                			"fields": [
                				{
                					"type": "mrkdwn",
                					"text": `*Repository:*\n${PARAMS.repositoryName}`
                				},
                				{
                					"type": "mrkdwn",
                					"text": `*Code Coverage :*\n *\`${coverage_percentage}%\`*`
                				},
                				{
                					"type": "mrkdwn",
                					"text": `*Created At:*\n ${SLACK_BUILD_TIME}`
                				},
                				{
                					"type": "mrkdwn",
                          "text": `*Link:*\n *<${PR_URL}|ClickHere>*`
                				}
                			]
                		}
                	]
                };
            var r = https.request(POST_OPTIONS, function(res) {
                                res.setEncoding('utf8');
                                res.on('data', function (data) {
                                    context.succeed("Message Sent: " + data);
                             });
            }).on("error", function(e) {context.fail("Failed: " + e);} );
            r.write(util.format("%j", message));
            r.end();

            codecommit.postCommentForPullRequest(PARAMS, function (error, postCommentResponse) {
                if (error) {
                    console.log(error, error.stack);
                } else {
                    let approvalState = 'REVOKE';
                    if (coverage_percentage === '100' && total_tests === successful_tests) {
                        approvalState = 'APPROVE';
                    }
                    var params = {
                        approvalState: approvalState,
                        pullRequestId: PARAMS.pullRequestId,
                        revisionId: REVISION_ID
                    };
                    codecommit.updatePullRequestApprovalState(params, function (err, data) {
                        if (err) console.log(err, err.stack); // an error occurred
                        else console.log(data);           // successful response
                    });
                }
            });
        }
    });
};
