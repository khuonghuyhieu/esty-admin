export function up(pgm) {
  pgm.createSchema('foundation');
}

export function down(pgm) {
  pgm.dropSchema('foundation');
}
