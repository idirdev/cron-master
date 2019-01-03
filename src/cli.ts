#!/usr/bin/env node

import { Command } from 'commander';
import { Scheduler } from './Scheduler.js';
import { CronParser } from './Parser.js';
import { Monitor } from './Monitor.js';

const program = new Command();

program
  .name('cron-master')
  .description('Cron job scheduler and manager with monitoring and REST API')
  .version('1.0.0');

program
  .command('validate <expression>')
  .description('Validate a cron expression')
  .action((expression: string) => {
    const parser = new CronParser();
    const error = parser.validate(expression);
    if (error) {
      console.error(`Invalid: ${error}`);
      process.exit(1);
    } else {
      console.log(`Valid cron expression: ${expression}`);
      const parsed = parser.parse(expression);
      const nextRun = parser.getNextRun(parsed);
      console.log(`Next run: ${nextRun.toISOString()}`);
    }
  });

program
  .command('next <expression>')
  .description('Show the next N run times for a cron expression')
  .option('-n, --count <number>', 'Number of upcoming runs to show', '5')
  .action((expression: string, opts) => {
    const parser = new CronParser();
    const error = parser.validate(expression);
    if (error) {
      console.error(`Invalid expression: ${error}`);
      process.exit(1);
    }

    const parsed = parser.parse(expression);
    const count = parseInt(opts.count, 10);
    console.log(`Next ${count} runs for "${expression}":`);
    let current = new Date();
    for (let i = 0; i < count; i++) {
      const next = parser.getNextRun(parsed, current);
      console.log(`  ${i + 1}. ${next.toISOString()}`);
      current = new Date(next.getTime() + 1000);
    }
  });

program
  .command('start')
  .description('Start the scheduler with jobs from a config file')
  .option('-c, --config <path>', 'Path to job configuration file')
  .action(async (opts) => {
    const scheduler = new Scheduler();
    const monitor = new Monitor(scheduler);

    if (opts.config) {
      console.log(`Loading jobs from: ${opts.config}`);
    }

    console.log('Starting scheduler...');
    scheduler.start();

    const snapshot = monitor.getSnapshot();
    console.log(`Active jobs: ${snapshot.activeJobs}`);
    console.log('Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
      console.log('\nStopping scheduler...');
      scheduler.stop();
      process.exit(0);
    });
  });

program.parse();
