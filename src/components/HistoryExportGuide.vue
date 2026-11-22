<script setup lang="ts">
import { useTemplateRef } from 'vue'
import AppButton, { BUTTON_SIZE, BUTTON_VARIANT } from './common/AppButton.vue'

const SPOTIFY_PRIVACY_URL = 'https://www.spotify.com/us/account/privacy/'

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

function open(): void {
  dialog.value?.showModal()
}

function close(): void {
  dialog.value?.close()
}

/** A modal dialog's own box is inside it, so a hit on the element is the backdrop. */
function onDialogClick(event: MouseEvent): void {
  if (event.target === dialog.value) close()
}
</script>

<template>
  <div class="guide">
    <AppButton @click="open">Don’t have it yet?</AppButton>

    <dialog ref="dialog" class="guide__box" aria-labelledby="guide-title" @click="onDialogClick">
      <h2 id="guide-title" class="guide__title">Asking Spotify for your streaming history</h2>

      <p class="guide__lede">
        Spotify keeps every play it has ever logged, but it only hands the full record over on
        request. The request is free, and you make it once.
      </p>

      <ol class="guide__steps">
        <li>
          Open
          <a class="guide__link" :href="SPOTIFY_PRIVACY_URL" target="_blank" rel="noreferrer">
            your Spotify privacy settings
          </a>
          and sign in. Scroll to
          <strong>Download your data</strong>
          .
        </li>
        <li>
          Tick
          <strong>Extended streaming history</strong>
          . This is the one that matters — the
          <strong>Account data</strong>
          option above it covers only the past year and holds nothing this page can use.
        </li>
        <li>
          Click
          <strong>Request data</strong>
          , then confirm from the email Spotify sends you.
        </li>
        <li>
          Wait. Spotify says the extended history can take up to 30 days, and it does not arrive
          with the account data — the two are sent separately.
        </li>
        <li>
          When the download email arrives, save the
          <code>.zip</code>
          it links to. That zip, or the folder inside it once unzipped, is what you bring back here.
        </li>
      </ol>

      <p class="guide__note">
        Already asked and lost the email? Request it again from the same page — nothing is charged
        and nothing is lost by asking twice.
      </p>

      <AppButton
        class="guide__close"
        :variant="BUTTON_VARIANT.primary"
        :size="BUTTON_SIZE.medium"
        @click="close"
      >
        Close
      </AppButton>
    </dialog>
  </div>
</template>

<style scoped>
/* Declared here rather than inherited, so the guide carries its own look
   wherever it is dropped in. */
.guide {
  --ink: #0a0c0a;
  --panel: #12150f;
  --hairline: rgba(232, 236, 230, 0.1);
  --fg: #e9ede6;
  --fg-dim: #8b9186;
  --green: #1ed760;
}

.guide__box {
  width: min(540px, calc(100vw - 48px));
  padding: 32px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  box-shadow: 0 32px 64px -24px rgba(0, 0, 0, 0.9);
}

.guide__box::backdrop {
  background: rgba(10, 12, 10, 0.72);
}

.guide__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 12px;
}

.guide__lede,
.guide__note {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.guide__steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-dim);
}

.guide__steps strong {
  color: var(--fg);
  font-weight: 600;
}

.guide__steps code {
  font-family: var(--mono);
  font-size: 12.5px;
  padding: 2px 6px;
  color: var(--fg);
  background: rgba(232, 236, 230, 0.07);
}

.guide__link {
  color: var(--green);
}

.guide__close {
  margin-top: 24px;
}
</style>
