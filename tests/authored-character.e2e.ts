import { test, expect } from '@playwright/test';

test('authored characters load, animate independently and retain shared assets after disposal', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const characters = await import('/NewDawn/src/characters.ts');
    const authored = await import('/NewDawn/src/authored-character.ts');
    const appearance = await import('/NewDawn/src/appearance.ts');
    const look = appearance.defaultAppearance();
    const first = characters.createCharacter(look);
    const second = characters.createCharacter(look);
    const errors: string[] = [];
    for (const root of [first, second]) authored.attachAuthoredCharacter(root, look, error => errors.push(String(error)));
    await new Promise<void>((resolve, reject) => {
      const start = performance.now();
      const check = () => {
        if (errors.length) reject(new Error(errors.join(', ')));
        else if (first.getObjectByName('authored-character') && second.getObjectByName('authored-character')) resolve();
        else if (performance.now() - start > 30000) reject(new Error('Timed out loading characters'));
        else setTimeout(check, 50);
      };
      check();
    });

    const findSkinned = (root: typeof first) => {
      let found: import('three').SkinnedMesh | undefined;
      root.getObjectByName('authored-character')!.traverse(object => {
        if (!found && (object as import('three').SkinnedMesh).isSkinnedMesh) found = object as import('three').SkinnedMesh;
      });
      return found!;
    };
    const a = findSkinned(first);
    const b = findSkinned(second);
    const sharedGeometry = a.geometry === b.geometry;
    const independentSkeleton = a.skeleton !== b.skeleton && a.skeleton.bones[0] !== b.skeleton.bones[0];
    authored.updateAuthoredCharacter(first, 0.3, 1, false, undefined, false);
    authored.updateAuthoredCharacter(second, 0.3, 0, false, undefined, false);
    const firstAction = first.userData.authoredAvatar.current;
    const secondAction = second.userData.authoredAvatar.current;
    characters.disposeCharacter(first);
    const secondStillAnimated = authored.updateAuthoredCharacter(second, 0.3, 1, true, undefined, false);
    const runAction = second.userData.authoredAvatar.current;
    characters.disposeCharacter(second);
    return { sharedGeometry, independentSkeleton, firstAction, secondAction, secondStillAnimated, runAction, errors };
  });
  expect(result).toEqual({
    sharedGeometry: true, independentSkeleton: true, firstAction: 'Walk_Loop', secondAction: 'Idle_Loop',
    secondStillAnimated: true, runAction: 'Sprint_Loop', errors: [],
  });
});

test('a failed asset load reports the error and retains the procedural fallback', async ({ page }) => {
  await page.route('**/UAL1_Standard.glb', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const characters = await import('/NewDawn/src/characters.ts');
    const authored = await import('/NewDawn/src/authored-character.ts');
    const appearance = await import('/NewDawn/src/appearance.ts');
    const look = appearance.defaultAppearance();
    const root = characters.createCharacter(look);
    const error = await new Promise<string>(resolve => {
      authored.attachAuthoredCharacter(root, look, failure => resolve(String(failure)));
    });
    const fallbackVisible = root.getObjectByName('torso')?.visible;
    const authoredVisible = Boolean(root.getObjectByName('authored-character'));
    characters.disposeCharacter(root);
    return { error, fallbackVisible, authoredVisible };
  });
  expect(result.error).toContain('404');
  expect(result.fallbackVisible).toBe(true);
  expect(result.authoredVisible).toBe(false);
});
