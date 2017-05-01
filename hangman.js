const http = require('http')
const fs = require('fs')
const querystring = require('querystring')

const online = false

const loadWords = (filename = 'words.txt') => {
  /**
   * read words from file 'words.txt' and convert it to an optimized array
   */
  return fs.readFileSync(filename, 'utf-8').split('\n').map(word => {
    word = word.toLowerCase()
    return {
      raw: word,
      alphas: word.split('')
    }
  })
}

const getCacher = words => {
  const map = {}

  const underlines = {}
  words.forEach(word => {
    if (!underlines[word.raw.length]) underlines[word.raw.length] = word.raw.replace(/./g, '_')
    const state = underlines[word.raw.length]
    if (!map[state]) map[state] = []
    map[state].push(word)
  })

  // const add = word => {
  //   // in case our dict need to learn
  //   Object.keys(map).forEach(state => {
  //     if (wordMatchState(state)) {
  //       map[state].push(word)
  //     }
  //   })
  // }
  const get = state => {
    return map[state]
  }
  // const set = (state, words) => {
  //   if (!map[state]) map[state] = words
  //   console.log(`cache has`, Object.keys(map))
  // }
  return {
    // add,
    get,
    // set
  }
}

const getMatcher = (words) => {
  const answer = online ? null : words[Math.floor(Math.random() * words.length)]
  let state = online ? null : answer.raw.replace(/./g, '_')
  let token
  const offlineMatch = guessAlpha => {
    let correct = false
    const newState = answer.alphas.map((alpha, i) => {
      if (state[i] === '_' && alpha.toLowerCase() === guessAlpha) {
        correct = true
        return alpha
      }
      return state[i]
    }).join('')
    state = newState
    return Promise.resolve({
      hangman: newState,
      correct
    })
  }
  const onlineMatch = guessAlpha => {
    return new Promise((resolve, reject) => {
      const request = http.request(
        Object.assign(
          {
            host: 'hangman-api.herokuapp.com',
            path: '/hangman',
          },
          ! guessAlpha
          // to start a game
          ? {
            method: 'POST',
          }
          // to continue a game
          : {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
          }
        ),
        response => {
          response.setEncoding('utf-8')
          response.on('data', response => {
            response = JSON.parse(response)
            token = response.token
            resolve(response)
          })
          response.on('error', error => reject(error))
        }
      )
      if (guessAlpha) request.write(querystring.stringify({token, letter: guessAlpha}))
      request.end()
    })
  }
  const match = (guessAlpha = '') => {
    return online ? onlineMatch(guessAlpha) : offlineMatch(guessAlpha)
  }
  return {
    match,
    answer: answer
  }
}

const getGuessor = (words, matcher) => {
  let state
  let errorCount = 0
  const alphas = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const usedAlphas = {}
  const unusedAlphas = {}
  alphas.forEach(alpha => unusedAlphas[alpha] = true)

  const getMostFrequentAlphaToGuess = () => {
    const frequences = {}
    Object.keys(unusedAlphas).forEach(alpha => {
      frequences[alpha] = 0
    })
    words.forEach((word, i) => {
      word.alphas.forEach(alpha => {
        if (unusedAlphas[alpha]) frequences[alpha]++
      })
    })
    let maxCount = 0
    let mostFrequentAlpha
    Object.keys(frequences).forEach(alpha => {
      if (frequences[alpha] > maxCount) {
        maxCount = frequences[alpha]
        mostFrequentAlpha = alpha
      }
    })
    let theAlpha
    if (mostFrequentAlpha) theAlpha = mostFrequentAlpha
    else {
      console.warn(state, 'mismatch all remaining words:', words)
      if (Object.keys(unusedAlphas).length) {
        theAlpha = Object.keys(unusedAlphas).shift()
      } else {
        console.warn('have tried the whole alphabet')
      }
    }
    usedAlphas[theAlpha] = Object.keys(usedAlphas).length
    delete unusedAlphas[theAlpha]
    return theAlpha
  }

  const filter = (alpha, newState) => {
    const matchNewState = newState => {
      const regexp = new RegExp('^' + newState.replace(/_/g, '.') + '$')
      return words.filter(word => regexp.test(word.raw))
    }

    const excludeAlpha = alpha => {
      return words.filter(word => word.raw.indexOf(alpha) === -1)
    }

    if (state !== newState) {
      words = cache.get(newState) || matchNewState(newState)
    } else {
      words = excludeAlpha(alpha)
      errorCount++
    }
  }

  const guess = () => {
    /**
     * guess with the alpha
     * send a request to the API
     * return a Promise
     */
    return new Promise((resolve, reject) => {
      const analyse = (alpha, result) => {
        try {
          if (typeof result === 'string') result = JSON.parse(result)
          const newState = result.hangman
          if (newState.indexOf('_') === -1) {
            if (errorCount >= 7) console.log(`guessing ${newState} made ${errorCount} errors`)
            resolve({count: errorCount, word: newState})
          } else {
            filter(alpha, newState)
            state = newState
            resolve()
          }
        } catch (err) {
          reject(err)
        }
      }
      const alpha = state && getMostFrequentAlphaToGuess()
      matcher.match(alpha).then(response => analyse(alpha, response))
    })
  }

  return {
    guess
  }
}

const playOnce = (words) => {
  const matcher = getMatcher(words)
  const guessor = getGuessor(words, matcher)

  const round = () => {
    return guessor.guess().then(result => result || round())
  }

  return round()
}

const playManyTimes = (words, times = 1000) => {
  const counts = []
  const start = +new Date()
  const round = () => {
    return playOnce(words)
      .then(({count, word}) => {
        counts.push(count)
        return counts.length < times ? round() : {time: +new Date() - start, counts}
      }, err => {
        console.log(err)
        return round()
      })
  }
  
  return round()
}

const words = online ? [] : loadWords()
const cache = getCacher(words)

// playOnce(words).then(result => console.log(result), err => console.log(err))

playManyTimes(words, 4).then(({time, counts}) => {
  console.log(`guessed ${counts.length} words, average make ${(counts.reduce((prev, cur) => prev + cur, 0)/counts.length).toFixed(2)} errors`)
  console.log(`used ${time / 1000}s, average word time is ${(time/counts.length/1000).toFixed(4)}s`)
})

// playManyTimes(words).then(({time, counts}) => {
//   console.log(`end after ${time / 1000}s, average word time is ${(time/counts.length/1000).toFixed(4)}s`)
// })
