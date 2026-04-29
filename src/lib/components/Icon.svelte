<script lang="ts">
  export let name: string;
  export let size = '1em';

  const glyphs: Record<string, string> = {
    add: 'add',
    'arrow-back': 'arrow_back',
    attach_file: 'attach_file',
    camera: 'camera_alt',
    chat: 'chat',
    download: 'download',
    edit: 'edit',
    error_outline: 'error_outline',
    check: 'check',
    done_all: 'done_all',
    insert_drive_file: 'insert_drive_file',
    mic: 'mic',
    mood: 'mood',
    more: 'more_vert',
    more_vert: 'more_vert',
    person: 'person',
    photo_camera: 'photo_camera',
    schedule: 'schedule',
    search: 'search',
    send: 'send',
    settings: 'settings',
    updates: 'data_usage',
    video: 'videocam',
    videocam: 'videocam',
    'volume-off': 'volume_off',
    volume_off: 'volume_off'
  };
</script>

<span class="material-symbols-rounded icon" style:font-size={size} aria-hidden="true">{glyphs[name] ?? name}</span>

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: normal;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: 'liga';
    -webkit-font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
  }
</style>
