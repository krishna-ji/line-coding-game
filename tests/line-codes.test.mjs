import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encode, generateBits, gradeSamples, parseBits, schemes } from '../src/line-codes.ts'

const vectors = [
    ['unipolar-nrz', [1, 1, 0, 0, 1, 1, 1, 1, 0, 0]],
    ['polar-nrz', [1, 1, -1, -1, 1, 1, 1, 1, -1, -1]],
    ['unipolar-rz', [1, 0, 0, 0, 1, 0, 1, 0, 0, 0]],
    ['polar-rz', [1, 0, -1, 0, 1, 0, 1, 0, -1, 0]],
    ['manchester', [1, -1, -1, 1, 1, -1, 1, -1, -1, 1]],
    ['differential-manchester', [1, -1, 1, -1, -1, 1, 1, -1, 1, -1]],
    ['ami', [1, 1, 0, 0, -1, -1, 1, 1, 0, 0]],
    ['ami-rz', [1, 0, 0, 0, -1, 0, 1, 0, 0, 0]],
    ['differential-rz', [1, 0, -1, 0, 1, 0, 0, 0, -1, 0]],
    ['hdb3', [1, 1, 0, 0, -1, -1, 1, 1, 0, 0]],
]

for (const [code, expected] of vectors) {
    test(`${code}: reference vector 10110`, () => {
        assert.deepEqual(encode('10110', code).levels, expected)
    })
}

test('Manchester reference names the convention used by the waveform', () => {
    assert.match(schemes.find((scheme) => scheme.id === 'manchester').convention, /G\. E\. Thomas/)
    assert.deepEqual(encode('01', 'manchester').levels, [-1, 1, 1, -1])
})

test('HDB3 substitutes even parity with B00V and odd parity with 000V', () => {
    assert.deepEqual(encode('0000', 'hdb3'), { levels: [1, 1, 0, 0, 0, 0, 1, 1], markers: ['B', '', '', 'V'] })
    assert.deepEqual(encode('10000', 'hdb3'), { levels: [1, 1, 0, 0, 0, 0, 0, 0, 1, 1], markers: ['', '', '', '', 'V'] })
    assert.deepEqual(encode('110000', 'hdb3').markers, ['', '', 'B', '', '', 'V'])
    assert.deepEqual(encode('00000000', 'hdb3').levels, [1, 1, 0, 0, 0, 0, 1, 1, -1, -1, 0, 0, 0, 0, -1, -1])
    assert.deepEqual(encode('1000010000', 'hdb3').markers, ['', '', '', '', 'V', '', '', '', '', 'V'])
})

test('all 8-bit inputs have valid sample counts, levels, and code invariants', () => {
    for (let value = 0; value < 256; value++) {
        const bits = value.toString(2).padStart(8, '0')
        for (const scheme of schemes) {
            const { levels, markers } = encode(bits, scheme.id)
            assert.equal(levels.length, bits.length * 2)
            assert.equal(markers.length, bits.length)
            assert.ok(levels.every((level) => [-1, 0, 1].includes(level)))
            if (['unipolar-rz', 'polar-rz', 'ami-rz', 'differential-rz'].includes(scheme.id)) {
                assert.ok(levels.every((level, index) => index % 2 === 0 || level === 0))
            }
            if (['manchester', 'differential-manchester'].includes(scheme.id)) {
                assert.ok(levels.every((level, index) => index % 2 === 0 || level === -levels[index - 1]))
            }
            if (scheme.id === 'differential-manchester') {
                const decoded = bits.split('').map((_, index) => levels[index * 2] === (index === 0 ? 1 : levels[index * 2 - 1]) ? '1' : '0').join('')
                assert.equal(decoded, bits)
            }
            if (scheme.id === 'hdb3') {
                const pulses = levels.filter((_, index) => index % 2 === 0)
                assert.ok(!pulses.join(',').includes('0,0,0,0'))
                let lastPulse = -1
                const decoded = pulses.map((pulse) => pulse === 0 ? '0' : '1')
                for (let index = 0; index < pulses.length; index++) {
                    if (pulses[index] === 0) continue
                    if (pulses[index] === lastPulse) decoded.splice(index - 3, 4, '0', '0', '0', '0')
                    lastPulse = pulses[index]
                }
                assert.equal(decoded.join(''), bits)
            }
        }
    }
})

test('binary input accepts spacing and rejects nonbinary or oversized sequences', () => {
    assert.equal(parseBits('10 01\n01'), '100101')
    for (const input of ['', '102', 'abc', '1'.repeat(33)]) assert.throws(() => parseBits(input))
    assert.throws(() => encode('101', 'unknown'))
})

test('generated challenges have the requested length and meaningful HDB3 substitutions', () => {
    for (const scheme of schemes) {
        for (const length of [4, 8, 12, 16, 24]) {
            const bits = generateBits(length, scheme.id)
            assert.equal(bits.length, length)
            assert.match(bits, /^[01]+$/)
            if (scheme.id === 'hdb3') assert.ok(bits.includes('0000'))
        }
    }
    for (const length of [0, 3, 25, 4.5]) assert.throws(() => generateBits(length, 'ami'))
})

test('grading treats unpainted samples as missing, not as zero voltage', () => {
    assert.deepEqual(gradeSamples([1, 1, 0, 0], [1, 1, 0, 0]), { correct: 2, total: 2, wrongBits: [] })
    assert.deepEqual(gradeSamples([1, 1, null, null], [1, 1, 0, 0]), { correct: 1, total: 2, wrongBits: [1] })
    assert.deepEqual(gradeSamples([1, 0, 0, 0], [1, 1, 0, 0]), { correct: 1, total: 2, wrongBits: [0] })
})