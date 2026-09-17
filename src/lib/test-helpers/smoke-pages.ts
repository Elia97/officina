import { join } from 'node:path'

import { FIXTURE_ROOT } from '../../test-fixture.ts'
import { expectedRoutes, readPageFiles, smokeRoutes } from '../routes.ts'

const PAGES_DIR = join(FIXTURE_ROOT, 'src/pages')

/** Le stesse rotte che `officina check smoke` deriva e passa a runChecks(), lette dal progetto di prova. */
export const PAGES = smokeRoutes(expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR))
