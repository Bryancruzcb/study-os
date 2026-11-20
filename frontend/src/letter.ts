const LETTERS = 'ABCDEFGHIJ'

/* an option's letter, A for the first; past J the number, which no question reaches today */
export const letter = (i: number): string => LETTERS[i] ?? String(i + 1)
