export type Level = -1 | 0 | 1
export type CodeId = 'unipolar-nrz' | 'polar-nrz' | 'unipolar-rz' | 'polar-rz' | 'manchester' | 'differential-manchester' | 'ami' | 'ami-rz' | 'differential-rz' | 'hdb3'

export interface Scheme {
    id: CodeId
    name: string
    shortName: string
    group: string
    family: string
    one: string
    zero: string
    convention: string
    fact: string
}

export const schemes: Scheme[] = [
    { id: 'unipolar-nrz', name: 'Unipolar NRZ', shortName: 'NRZ', group: 'Non-return to zero', family: 'Unipolar', one: '+V for the entire bit', zero: '0 V for the entire bit', convention: 'Positive logic; 1 = +V.', fact: 'One polarity, two levels. Long runs have no timing transitions.' },
    { id: 'polar-nrz', name: 'Bipolar NRZ', shortName: 'NRZ-L', group: 'Non-return to zero', family: 'Polar', one: '+V for the entire bit', zero: '-V for the entire bit', convention: 'Polar NRZ-L; 1 = +V, 0 = -V.', fact: 'Also called polar NRZ. Unlike AMI, consecutive 1s keep the same polarity.' },
    { id: 'unipolar-rz', name: 'Unipolar RZ', shortName: 'RZ', group: 'Return to zero', family: 'Unipolar', one: '+V, then 0 V', zero: '0 V for the entire bit', convention: '50% pulse duty cycle.', fact: 'Every mark returns to zero halfway through its bit interval.' },
    { id: 'polar-rz', name: 'Bipolar RZ', shortName: 'Polar RZ', group: 'Return to zero', family: 'Polar', one: '+V, then 0 V', zero: '-V, then 0 V', convention: 'Polar RZ; 50% pulse duty cycle.', fact: 'Positive and negative pulses both return to zero at the midpoint.' },
    { id: 'manchester', name: 'Manchester', shortName: 'Manchester', group: 'Biphase', family: 'Split phase', one: '+V, then -V', zero: '-V, then +V', convention: 'G. E. Thomas convention; 1 falls, 0 rises.', fact: 'A mid-bit transition supplies clock timing in every bit interval.' },
    { id: 'differential-manchester', name: 'Differential Manchester', shortName: 'Diff. Manchester', group: 'Biphase', family: 'Differential', one: 'No transition at the bit boundary', zero: 'Transition at the bit boundary', convention: 'Initial level +V; every bit has a midpoint transition.', fact: 'Information is carried by transitions, not absolute voltage polarity.' },
    { id: 'ami', name: 'AMI', shortName: 'AMI', group: 'Bipolar & differential', family: 'Alternate mark inversion', one: 'Alternate +V and -V marks', zero: '0 V for the entire bit', convention: 'First mark +V; full-bit pulses.', fact: 'Successive 1s alternate polarity. Zero bits stay at the baseline.' },
    { id: 'ami-rz', name: 'RZ-AMI', shortName: 'RZ-AMI', group: 'Bipolar & differential', family: 'Alternate mark inversion', one: 'Alternating +V / -V, then 0 V', zero: '0 V for the entire bit', convention: 'First mark +V; 50% pulse duty cycle.', fact: 'The return-to-zero form of alternate mark inversion uses half-bit marks.' },
    { id: 'differential-rz', name: 'Differential RZ', shortName: 'Dicode RZ', group: 'Bipolar & differential', family: 'Dicode', one: '0 to 1: +V, then 0 V', zero: '1 to 0: -V, then 0 V', convention: 'Previous input bit 0; unchanged bits produce 0 V.', fact: 'Only input changes produce pulses: positive for 0 to 1, negative for 1 to 0.' },
    { id: 'hdb3', name: 'HDB3', shortName: 'HDB3', group: 'Bipolar & differential', family: 'High-density bipolar', one: 'Alternate +V and -V marks', zero: 'Four zeros become 000V or B00V', convention: 'First mark +V; even parity selects B00V.', fact: 'B is a balancing mark; V deliberately violates AMI polarity. Parity resets after V.' },
]

export interface EncodedSignal {
    levels: Level[]
    markers: ('' | 'B' | 'V')[]
}

export function parseBits(input: string): string {
    const bits = input.replace(/\s/g, '')
    if (!/^[01]{1,32}$/.test(bits)) throw new Error('Use 1 to 32 binary digits (0 or 1).')
    return bits
}

export function encode(input: string, code: CodeId): EncodedSignal {
    const bits = parseBits(input)
    if (!schemes.some((scheme) => scheme.id === code)) throw new Error('Unknown line code.')
    const levels: Level[] = []
    const markers: EncodedSignal['markers'] = Array.from({ length: bits.length }, () => '')
    let polarity: Level = -1
    let differentialLevel: Level = 1
    let previousBit = '0'
    let marksSinceViolation = 0

    for (let index = 0; index < bits.length; index++) {
        const bit = bits[index]
        let first: Level = 0
        let second: Level = 0

        if (code === 'hdb3' && bits.slice(index, index + 4) === '0000') {
            if (marksSinceViolation % 2 === 0) {
                polarity = -polarity as Level
                levels.push(polarity, polarity, 0, 0, 0, 0, polarity, polarity)
                markers[index] = 'B'
            } else {
                levels.push(0, 0, 0, 0, 0, 0, polarity, polarity)
            }
            markers[index + 3] = 'V'
            marksSinceViolation = 0
            index += 3
            continue
        }

        switch (code) {
            case 'unipolar-nrz':
                first = second = bit === '1' ? 1 : 0
                break
            case 'polar-nrz':
                first = second = bit === '1' ? 1 : -1
                break
            case 'unipolar-rz':
                first = bit === '1' ? 1 : 0
                break
            case 'polar-rz':
                first = bit === '1' ? 1 : -1
                break
            case 'manchester':
                first = bit === '1' ? 1 : -1
                second = -first as Level
                break
            case 'differential-manchester':
                if (bit === '0') differentialLevel = -differentialLevel as Level
                first = differentialLevel
                second = -first as Level
                differentialLevel = second
                break
            case 'differential-rz':
                first = bit === previousBit ? 0 : bit === '1' ? 1 : -1
                previousBit = bit
                break
            case 'ami':
            case 'ami-rz':
            case 'hdb3':
                if (bit === '1') {
                    polarity = -polarity as Level
                    first = polarity
                    marksSinceViolation++
                }
                second = code === 'ami-rz' ? 0 : first
                break
        }
        levels.push(first, second)
    }

    return { levels, markers }
}

export function generateBits(length: number, code: CodeId): string {
    if (!Number.isInteger(length) || length < 4 || length > 24) throw new Error('Sequence length must be between 4 and 24 bits.')
    const random = crypto.getRandomValues(new Uint8Array(length))
    const bits = Array.from(random, (value) => String(value % 2))
    if (code === 'hdb3') {
        const start = random[0] % (length - 3)
        bits.splice(start, 4, '0', '0', '0', '0')
        if (length > 4) bits[start === 0 ? 4 : 0] = '1'
    } else {
        bits[0] = '1'
        bits[length - 1] = '0'
    }
    return bits.join('')
}

export function gradeSamples(actual: (Level | null)[], expected: Level[]): { correct: number; total: number; wrongBits: number[] } {
    const wrongBits: number[] = []
    for (let index = 0; index < expected.length; index += 2) {
        if (actual[index] !== expected[index] || actual[index + 1] !== expected[index + 1]) wrongBits.push(index / 2)
    }
    const total = expected.length / 2
    return { correct: total - wrongBits.length, total, wrongBits }
}