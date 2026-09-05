/* "1 concept", "2 concepts", "0 questions" */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
