export const Photo = {
  type: "FeatureCollection",
  crs: { type: "name", properties: { name: "EPSG:6318" } },
  features: [
    {
      type: "Feature",
      id: 0,
      geometry: {
        type: "Point",
        coordinates: [-80.203326258621009, 26.001171941070968, 20],
      },
      properties: { FID: 0, Id: 1, Name: "unrecorded_utilities" },
    },
    {
      type: "Feature",
      id: 1,
      geometry: {
        type: "Point",
        coordinates: [-80.20016332814421, 25.99975256335015, 20],
      },
      properties: { FID: 1, Id: 2, Name: "field_adjustment1" },
    },
    {
      type: "Feature",
      id: 1,
      geometry: {
        type: "Point",
        coordinates: [-80.20303419307372, 25.999539361626187, 20],
      },
      properties: { FID: 1, Id: 3, File: "additional_laterals" },
    },
  ],
};
