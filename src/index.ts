import { execSync } from 'child_process';
import path from 'path';
import { writeFileSync } from 'fs';
import yargs from 'yargs';

const argv = yargs
	.help()
	.alias('h', 'help')
	.option('verbose', {
		alias: 'v',
		description: 'Displays results with more detail then the usual scan',
		type: 'boolean',
		default: false
	})
	.option('concise', {
		alias: 'c',
		description: 'Displays a concise readout of scan results',
		type: 'boolean',
		default: false
	})
	.option('threshold', {
		alias: 't',
		description: 'Commit message character threshold',
		type: 'number',
		default: 10
	})
	.option('csv', {
		description: 'Saves commit history as a .csv file',
		type: 'boolean',
		default: false
	})
	.option('out', {
		description: 'Specify output location of .csv file',
		type: 'string',
		default: './commits.csv',
		normalize: true
	})
	.usage('$0 is a git commit scanner made by Ben Segal.\nUsage: $0 [options] [path]')
	.version(false)
	.argv;

type Commit = {
	hash: string,
	author: string,
	message: string,
	timestamp: Date,
	changes: number
};
type CommitTimeDifference = {
	difference: number,
	firstCommit: Commit,
	secondCommit: Commit
};

// Run git log and exit if there is an error
let rawLog: Buffer;
try {
	const location = path.normalize(argv._[0]?.toString() || '')
	rawLog = execSync(`cd ${location} && git log --no-merges --format=".%n.%H%n%ae%n%s%n%ci" --stat`);
} catch (error) {
	console.error('Unable to get commits!');
	process.exit(1);
}

// Separate raw log buffer into individual commit strings.
const commitStrings = rawLog.toString().split('.\n.').map(commit => commit.trim());
commitStrings.shift();

// Process commit strings into Commits
const commits: Array<Commit> = commitStrings.map(commit => {
	const [hash, email, message, time, ...stats] = commit.split('\n');
	const changes = stats.pop();

	const insertionsMatch = changes.match(/(\d+) insertion/);
	const deletionsMatch = changes.match(/(\d+) deletion/)
	const insertions = insertionsMatch ? parseInt(insertionsMatch[1]) : 0;
	const deletions = deletionsMatch ? parseInt(deletionsMatch[1]) : 0;

	return {
		hash,
		author: email.split('@')[0],
		message,
		timestamp: new Date(time),
		changes: insertions + deletions
	}
});

// Check for valid options
if (argv.verbose && argv.concise) {
	console.error('I can\'t be concise and verbose at the same time!');
	process.exit(1);
}

// Generate CSV
if (argv.csv) {
	let outFile = argv.out;

	// Make sure the output is a valid csv file and correct if needed
	if (outFile.endsWith(path.sep)) {
		outFile += 'commits.csv';
	}
	if (!outFile.endsWith('.csv')) {
		outFile += '.csv';
	}

	const TEMPLATE = '$hash,$timestamp,$author,$changes,$message';
	let buffer = TEMPLATE.replace(/\$/g, '');

	commits.forEach(commit => {
		buffer += `\n${TEMPLATE
			.replace('$hash', commit.hash)
			.replace('$timestamp', commit.timestamp.toISOString())
			.replace('$author', commit.author)
			.replace('$changes', commit.changes.toString())
			.replace('$message', commit.message)}`
	});

	try {
		writeFileSync(outFile, buffer);
	} catch (error) {
		console.error(`Could not save file to '${outFile}'!`);
		process.exit(1);
	}

	console.log(`Commit history saved to '${outFile}'.`);
	process.exit();
}

if (commits.length < 2) {
	console.error('This repo only has one commit. I need at least two commits to provide a meaningful analysis.');
	process.exit(1);
}

// Variables for processed commit info to go
const authors = new Map<string, { commitCount: number, changes: number }>();

let meaningfulMessages: number = 0;
const uniqueMessages = new Set<string>();

const timeDifferences: Array<number> = [];
let maxDifference: CommitTimeDifference = { difference: Number.MIN_SAFE_INTEGER, firstCommit: null, secondCommit: null };
let minDifference: CommitTimeDifference = { difference: Number.MAX_SAFE_INTEGER, firstCommit: null, secondCommit: null };

commits.forEach((commit, idx) => {
	// If the author already exists, update their entry in the authors map, if not, create an entry
	const authorInfo = authors.get(commit.author);
	if (authorInfo) {
		authors.set(commit.author, {
			commitCount: authorInfo.commitCount + 1,
			changes: authorInfo.changes + commit.changes
		});
	} else {
		authors.set(commit.author, {
			commitCount: 1,
			changes: commit.changes
		});
	}

	// Check if commit message length is over the meaningful threshold
	if (commit.message.length > argv.threshold) {
		meaningfulMessages++;
	}
	// Sets have inherent uniqueness so no duplicate messages are ever added
	uniqueMessages.add(commit.message);

	const nextCommit = commits[idx + 1];
	if (nextCommit) {
		// Time difference in ms between the current commit and the next one
		const difference = commit.timestamp.valueOf() - nextCommit.timestamp.valueOf()
		timeDifferences.push(difference);

		// Maximum time difference comparison
		if (difference > maxDifference.difference) {
			maxDifference = {
				difference,
				firstCommit: commit,
				secondCommit: nextCommit
			}
		}

		// Minimum time difference comparison
		if (difference < minDifference.difference) {
			minDifference = {
				difference,
				firstCommit: commit,
				secondCommit: nextCommit
			}
		}
	}
});

const authorCount = authors.size;
const totalChanges = commits.map(commit => commit.changes).reduce((a, b) => a + b);

let authorInfo = '';
authors.forEach(({ commitCount, changes }, author) => {
	const changePercent = Math.round((changes / totalChanges) * 100);
	if (!argv.verbose) {
		authorInfo += `\t${author} made ${commitCount} ${pluralize('commit', commitCount)} and ${changePercent}% of changes\n`;
	} else {
		const authorCommits = commits.filter(commit => commit.author === author).sort((a, b) => a.changes - b.changes);
		const largest = authorCommits.pop();
		const smallest = authorCommits.shift();
		authorInfo +=`\n\t${author}\n\t\t${commitCount} ${pluralize('commit', commitCount)} and ${changes} ${pluralize('change', changes)}\n` +
			`\t\tLargest commit: ${largest.hash.slice(0, 8)} has ${largest.changes} ${pluralize('change', largest.changes)}\n` +
			`\t\tSmallest commit: ${smallest.hash.slice(0, 8)} has ${smallest.changes} ${pluralize('change', smallest.changes)}\n`;
	}
});

const meaningfulPercent = Math.round((meaningfulMessages / commits.length) * 100);
const uniquePercent = Math.round((uniqueMessages.size / commits.length) * 100);

timeDifferences.sort();
const midpoint = Math.ceil(timeDifferences.length / 2);
const meanCommitTime = timeDifferences.reduce((a, b) => a + b) / timeDifferences.length;
const medianCommitTime = timeDifferences.length % 2 === 0
	? (timeDifferences[midpoint] + timeDifferences[midpoint - 1]) / 2
	: timeDifferences[midpoint - 1];


let output = `${commits.length} ${pluralize('commit', commits.length)} scanned.
${authorCount} ${pluralize('author', authorCount)} have commits in this repo.\n`;

if (!argv.concise) {
	output += `${authorInfo}${argv.verbose ? '\n' : ''}`;
}
output += `${meaningfulPercent}% of commits${argv.verbose ? ` (${meaningfulMessages}/${commits.length})` : ''}` +
	` had messages over ${argv.threshold} ${pluralize('character', argv.threshold)} long.\n` +
	`${uniquePercent}% of commits${argv.verbose ? ` (${uniqueMessages.size}/${commits.length})` : ''} had unique messages.\n`;

if (!argv.concise) {
	if (argv.verbose) {
		output += `\n${minDifference.firstCommit.hash.slice(0, 8)} and ${minDifference.secondCommit.hash.slice(0, 8)} ` +
			`were the two closest commits and were ${prettyPrintTimeSpan(minDifference.difference)} apart.\n` + 
			`\t${minDifference.firstCommit.hash.slice(0, 8)} (${minDifference.firstCommit.timestamp.toLocaleString()}): ` +
			`${minDifference.firstCommit.message}\n` +
			`\t${minDifference.secondCommit.hash.slice(0, 8)} (${minDifference.secondCommit.timestamp.toLocaleString()}): ` +
			`${minDifference.secondCommit.message}\n` +
			`\n${maxDifference.firstCommit.hash.slice(0, 8)} and ${maxDifference.secondCommit.hash.slice(0, 8)} ` +
			`were the two farthest commits and were ${prettyPrintTimeSpan(maxDifference.difference)} apart.\n` + 
			`\t${maxDifference.firstCommit.hash.slice(0, 8)} (${maxDifference.firstCommit.timestamp.toLocaleString()}): ` +
			`${maxDifference.firstCommit.message}\n` +
			`\t${maxDifference.secondCommit.hash.slice(0, 8)} (${maxDifference.secondCommit.timestamp.toLocaleString()}): ` +
			`${maxDifference.secondCommit.message}\n\n`;
	} else {
		output += `The two closest commits were ${prettyPrintTimeSpan(minDifference.difference)} apart.\n`+
			`The two farthest commits were ${prettyPrintTimeSpan(maxDifference.difference)} apart.\n`; 
	}

	output += `The average time between commits is ${prettyPrintTimeSpan(meanCommitTime)}.\n` + 
		`The median time between commits is ${prettyPrintTimeSpan(medianCommitTime)}.`;
}


console.log(output.trim());


//------------------------------------------//
//			UTILITY FUNCTIONS				//
//------------------------------------------//
function pluralize(str: string, num: number): string {
	return `${str}${num === 1 ? '' : 's'}`;
}

function prettyPrintTimeSpan(time: number) {
	const y = Math.floor(time / 31536000e3)
	time -= y * 31536000e3
	const d = Math.floor(time / 86400e3)
	time -= d * 86400e3
	const h = Math.floor(time / 3600e3)
	time -= h * 3600e3
	const m = Math.floor(time / 60e3)
	time -= m * 60e3
	const s = Math.floor(time / 1e3)

	return [
		y && `${y} ${pluralize('year', y)}`,
		d && `${d} ${pluralize('day', d)}`,
		h && `${h} ${pluralize('hour', h)}`,
		m && `${m} ${pluralize('minute', m)}`,
		s && `${s} ${pluralize('second', s)}`,
	].filter(Boolean).join(', ') || 'under a second'
}
