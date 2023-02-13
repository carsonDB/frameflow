/**
 * Provide browser or nodejs platform specific APIs.
 * TODO...
 */

import { isNode, isBrowser } from './utils'

export default {
    Worker: isNode ? require('node:worker_threads').Worker : window.Worker,

}