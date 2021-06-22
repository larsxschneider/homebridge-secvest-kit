import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SecvestContactAccessory } from './secvestContactAccessory';
import { SecvestLockAccessory } from './secvestLockAccessory';
import { SecvestMotionAccessory } from './secvestMotionAccessory';
import { SecvestPartitionAccessory } from './secvestPartitionAccessory';
import { SecvestSmokeAccessory } from './secvestSmokeAccessory';
import { SecvestWaterAccessory } from './secvestWaterAccessory';

import { request } from 'https';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SecvestPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:');

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories

      // this.unregisterAllAccessories();
      this.discoverDevices();
      setInterval(async () => {
        this.log.info('Polling Secvest state...');
        this.queryDevices(async (device) => {
          const accessory = this.accessories.find(a => a.UUID === device.uuid);
          if (accessory) {
            accessory.context.device = device;
            try {
              accessory.context.update(device);
            } catch (error) {
              this.log.error(error);
            }
          }
        });
      }, this.config.pollingInterval * 60000);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async queryPartitions(): Promise<object[]> {
    const options = {
      method: 'GET',
      hostname: this.config.host,
      port: this.config.port,
      path: '/system/partitions/',
      auth: `${this.config.username}:${this.config.password}`,
      rejectUnauthorized: false,
      agent: false,
    };
    const that = this;
    return new Promise(resolve => {
      request(
        options,
        (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk.toString('utf8');
          });
          response.on('end', () => {
            const partitions = JSON.parse(data)
              .filter(p => that.config.securityPartitions.includes(parseInt(p.id)))
              .map(z => ({
                id: parseInt(z.id),
                uuid: that.api.hap.uuid.generate(`secvest-partition-${z.id}`),
                type: 'partition',
                name: z.name,
                state: z.state,
              }));
            resolve(partitions);
          });
        },
      )
        .end();
    });
  }

  async queryZones(partition): Promise<object[]> {
    const options = {
      method: 'GET',
      hostname: this.config.host,
      port: this.config.port,
      path: `/system/partition-${partition}/zones/`,
      auth: `${this.config.username}:${this.config.password}`,
      rejectUnauthorized: false,
      agent: false,
    };
    const that = this;
    return new Promise(resolve => {
      request(
        options,
        (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk.toString('utf8');
          });
          response.on('end', () => {
            const zones = JSON.parse(data)
              .filter(z => 200 < parseInt(z.id) && parseInt(z.id) < 300)
              .map(z => ({
                id: parseInt(z.id),
                uuid: that.api.hap.uuid.generate(`secvest-zone-${z.id}`),
                type: that.config.zoneTypes[z.id] || 'contact',
                name: z.name,
                state: z.state,
              }));
            resolve(zones);
          });
        },
      )
        .end();
    });
  }

  // Read all partitions and return the devices (also called "zones").
  // The function takes a callback that is executed as soon as we retrieve
  // information about a device. This is way we can report updates to HomeKit
  // sooner if we query more than one partition.
  async queryDevices(callback?: (device: any) => void) {
    const allDevices : object[] = [];

    // Zones
    for (const id of this.config.accessoryPartitions) {
      const devices = await this.queryZones(id);
      if (callback) {
        devices.forEach((device) => {
          callback(device);
        });
      }
      allDevices.push(...devices);
    }

    // Partitions
    const partitions = await this.queryPartitions();
    if (callback) {
      partitions.forEach((partition) => {
        callback(partition);
      });
    }
    allDevices.push(...partitions);

    return allDevices;
  }

  // Helper function to clean out all the devices (not used by default)
  unregisterAllAccessories() {
    for (const accessory of this.accessories) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    this.accessories.length = 0;
  }

  // Remove all accessories that are not present anymore
  unregisterMissingAccessories(devices) {
    for (const accessory of this.accessories) {
      const existingDevice = devices.find(device => accessory.UUID === device.uuid);
      if (!existingDevice) {
        this.log.warn('Removing accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  setupAccessories(devices) {
    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      let accessory = this.accessories.find(a => a.UUID === device.uuid);
      const isNewAccessory = !accessory;

      if (accessory) {
        this.log.info('Adding restored accessory:', device.name);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        accessory = new this.api.platformAccessory(device.name, device.uuid);
        accessory.context.device = device;
      }

      switch (device.type) {
        case 'lock' : new SecvestLockAccessory(this, accessory); break;
        case 'motion' : new SecvestMotionAccessory(this, accessory); break;
        case 'partition': new SecvestPartitionAccessory(this, accessory); break;
        case 'smoke' : new SecvestSmokeAccessory(this, accessory); break;
        case 'water' : new SecvestWaterAccessory(this, accessory); break;
        default : new SecvestContactAccessory(this, accessory);
      }

      if (isNewAccessory) {
        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const devices = await this.queryDevices();
    this.log.debug(devices.length + ' Secvest devices found');

    this.unregisterMissingAccessories(devices);
    this.setupAccessories(devices);
  }
}
